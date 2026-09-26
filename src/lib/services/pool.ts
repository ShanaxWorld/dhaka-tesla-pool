// src/lib/services/pool.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { areCompatible } from "@/lib/matching";
import { calculateFare } from "@/lib/fare";

export class PoolError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Accept a ride request onto a driver's Tesla: join a compatible open pool
// or open a new one, enforcing capacity atomically.
export async function acceptRideRequest(
  prisma: PrismaClient,
  driverId: string,
  rideRequestId: string,
) {
  const tesla = await prisma.tesla.findUnique({ where: { driverId } });
  if (!tesla) throw new PoolError(404, "No Tesla for this driver");

  return prisma.$transaction(async (tx) => {
    const ride = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
    if (!ride) throw new PoolError(404, "Ride not found");
    if (ride.status !== "REQUESTED") throw new PoolError(409, `Ride is already ${ride.status}`);

    const openPools = await tx.pool.findMany({
      where: { teslaId: tesla.id, status: "OPEN" },
      include: { members: true },
    });

    let target: (typeof openPools)[number] | null = null;
    for (const pool of openPools) {
      const first = pool.members[0];
      if (!first) continue;
      if (areCompatible(first.pickupArea, first.dropoffArea, ride.pickupArea, ride.dropoffArea)
        && pool.seatsUsed + ride.seats <= tesla.capacity) {
        target = pool;
        break;
      }
    }

    let pooled = false;
    let poolId: string;

    if (target) {
      // Lock the pool row, then re-read seats under the lock.
      const locked = await tx.$queryRaw<{ seatsUsed: number }[]>(
        Prisma.sql`SELECT "seatsUsed" FROM "Pool" WHERE id = ${target.id} FOR UPDATE`
      );
      const currentSeats = locked[0].seatsUsed;
      if (currentSeats + ride.seats > tesla.capacity) {
        throw new PoolError(409, "No seats left in this pool");
      }
      await tx.pool.update({ where: { id: target.id }, data: { seatsUsed: currentSeats + ride.seats } });
      poolId = target.id;
      pooled = true;
    } else {
      const created = await tx.pool.create({
        data: { teslaId: tesla.id, pickupArea: ride.pickupArea, status: "OPEN", seatsUsed: ride.seats },
      });
      poolId = created.id;
    }

    const fare = calculateFare(ride.pickupArea, ride.dropoffArea, pooled);
    const updated = await tx.rideRequest.update({
      where: { id: ride.id },
      data: {
        status: "MATCHED", poolId, matchedAt: new Date(),
        baseFare: fare.baseFare, distanceCharge: fare.distanceCharge,
        poolDiscount: fare.poolDiscount, totalFare: fare.totalFare,
        events: { create: { fromStatus: "REQUESTED", toStatus: "MATCHED", note: pooled ? "Added to existing pool" : "New pool opened" } },
      },
    });

    if (pooled) {
      const first = await tx.rideRequest.findFirst({
        where: { poolId, id: { not: ride.id } },
        orderBy: { createdAt: "asc" },
      });
      if (first && first.poolDiscount === 0) {
        const f = calculateFare(first.pickupArea, first.dropoffArea, true);
        await tx.rideRequest.update({ where: { id: first.id }, data: { poolDiscount: f.poolDiscount, totalFare: f.totalFare } });
      }
    }

    return { ride: updated, poolId, pooled };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}