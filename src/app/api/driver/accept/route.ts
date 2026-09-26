// src/app/api/driver/accept/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { acceptRideRequest, PoolError } from "@/lib/services/pool";

const schema = z.object({ rideRequestId: z.string().min(1) });

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user.role !== "DRIVER") {
    return NextResponse.json({ error: "Only drivers can accept rides" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const result = await acceptRideRequest(prisma, user.id, parsed.data.rideRequestId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof PoolError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}