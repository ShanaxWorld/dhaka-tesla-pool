import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { areCompatible } from "@/lib/matching";
import { calculateFare } from "@/lib/fare";

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
  const { rideRequestId } = parsed.data;

  const tesla = await prisma.tesla.findUnique({ where: { driverId: user.id } });
  if (!tesla) return NextResponse.json({ error: "No Tesla for this driver" }, { status: 404 });

  try {
    // Everything below runs in ONE transaction. Serializable isolation +
    // an explicit row lock on the pool is what makes the last-seat race safe.
    const result = await prisma.$transaction(async (tx) => {
      const ride = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
      if (!ride) throw new HttpError(404, "Ride not found");
      if (ride.status !== "REQUESTED") throw new HttpError(409, `Ride is already ${ride.status}`);

      // Look for an OPEN pool on this Tesla that this rider is compatible with.
      const openPools = await tx.pool.findMany({
        where: { teslaId: tesla.id, status: "OPEN" },
        include: { members: true },
      });

      let target = null as (typeof openPools)[number] | null;
      for (const pool of openPools) {
        const first = pool.members[0];
        if (!first) continue;
        const compatible = areCompatible(
          first.pickupArea, first.dropoffArea,
          ride.pickupArea, ride.dropoffArea,
        );
        if (compatible && pool.seatsUsed + ride.seats <= tesla.capacity) {
          target = pool;
          break;
        }
      }

      let pooled = false;
      let poolId: string;

      if (target) {
        // ---- Join existing pool. Lock the pool row FIRST. ----
        // SELECT ... FOR UPDATE: any concurrent accept touching this pool
        // blocks here until we commit, so two riders can't both grab the
        // last seat. We re-read seatsUsed AFTER the lock — never trust the
        // value we read before locking.
        const locked = await tx.$queryRaw<{ seatsUsed: number }[]>(
          Prisma.sql`SELECT "seatsUsed" FROM "Pool" WHERE id = ${target.id} FOR UPDATE`
        );
        const currentSeats = locked[0].seatsUsed;
        if (currentSeats + ride.seats > tesla.capacity) {
          throw new HttpError(409, "No seats left in this pool");
        }
        await tx.pool.update({
          where: { id: target.id },
          data: { seatsUsed: currentSeats + ride.seats },
        });
        poolId = target.id;
        pooled = true;
      } else {
        // ---- No compatible pool: open a new one. ----
        const created = await tx.pool.create({
          data: {
            teslaId: tesla.id,
            pickupArea: ride.pickupArea,
            status: "OPEN",
            seatsUsed: ride.seats,
          },
        });
        poolId = created.id;
      }

      // Recompute fare with the pool discount if this ride is now pooled.
      const fare = calculateFare(ride.pickupArea, ride.dropoffArea, pooled);

      const updated = await tx.rideRequest.update({
        where: { id: ride.id },
        data: {
          status: "MATCHED",
          poolId,
          matchedAt: new Date(),
          baseFare: fare.baseFare,
          distanceCharge: fare.distanceCharge,
          poolDiscount: fare.poolDiscount,
          totalFare: fare.totalFare,
          events: { create: { fromStatus: "REQUESTED", toStatus: "MATCHED", note: pooled ? "Added to existing pool" : "New pool opened" } },
        },
      });

      // If this made a solo ride into a pool, discount the first rider too.
      if (pooled) {
        const first = await tx.rideRequest.findFirst({
          where: { poolId, id: { not: ride.id } },
          orderBy: { createdAt: "asc" },
        });
        if (first && first.poolDiscount === 0) {
          const f = calculateFare(first.pickupArea, first.dropoffArea, true);
          await tx.rideRequest.update({
            where: { id: first.id },
            data: { poolDiscount: f.poolDiscount, totalFare: f.totalFare },
          });
        }
      }

      return { ride: updated, poolId, pooled };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}