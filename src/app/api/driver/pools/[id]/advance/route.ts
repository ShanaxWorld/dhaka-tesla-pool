import { NextResponse } from "next/server";
import { z } from "zod";
import { PoolStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { canTransition, POOL_TO_RIDE } from "@/lib/lifecycle";

const schema = z.object({ to: z.nativeEnum(PoolStatus) });

const TIMESTAMP_FIELD: Partial<Record<PoolStatus, string>> = {
  DRIVER_ARRIVED: "arrivedAt",
  STARTED: "startedAt",
  COMPLETED: "completedAt",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user.role !== "DRIVER") {
    return NextResponse.json({ error: "Only drivers can advance a pool" }, { status: 403 });
  }
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { to } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const pool = await tx.pool.findUnique({
        where: { id },
        include: { tesla: true, members: true },
      });
      if (!pool) throw new HttpError(404, "Pool not found");
      // Ownership: the pool must belong to THIS driver's Tesla.
      if (pool.tesla.driverId !== user.id) throw new HttpError(403, "Not your pool");

      // The core guard: reject any illegal transition.
      if (!canTransition(pool.status, to)) {
        throw new HttpError(409, `Illegal transition ${pool.status} -> ${to}`);
      }

      const ts = TIMESTAMP_FIELD[to];
      const updatedPool = await tx.pool.update({
        where: { id },
        data: { status: to, ...(ts ? { [ts]: new Date() } : {}) },
      });

      // Propagate to every member ride (skip anyone who already cancelled).
      const rideStatus = POOL_TO_RIDE[to];
      if (rideStatus) {
        for (const m of pool.members) {
          if (m.status === "CANCELLED") continue;
          await tx.rideRequest.update({
            where: { id: m.id },
            data: {
              status: rideStatus,
              ...(to === "COMPLETED" ? { completedAt: new Date() } : {}),
              events: { create: { fromStatus: m.status, toStatus: rideStatus, note: `Pool -> ${to}` } },
            },
          });
        }
      }

      return { pool: updatedPool };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}