// tests/pool.integration.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient, Role, Area } from "@prisma/client";
import { acceptRideRequest, PoolError } from "@/lib/services/pool";

const prisma = new PrismaClient();

async function freshDriverWithCapacity(capacity: number) {
  const driver = await prisma.user.create({
    data: {
      name: "TestDriver", email: `driver-${Date.now()}-${Math.random()}@t.dev`,
      passwordHash: "x", role: Role.DRIVER,
      tesla: { create: { name: "TestTesla", capacity } },
    },
    include: { tesla: true },
  });
  return driver;
}

async function makeRequest(seats: number, pickup = Area.BANANI, dropoff = Area.MOHAKHALI) {
  const p = await prisma.user.create({
    data: { name: "P", email: `p-${Date.now()}-${Math.random()}@t.dev`, passwordHash: "x", role: Role.PASSENGER },
  });
  return prisma.rideRequest.create({
    data: { passengerId: p.id, pickupArea: pickup, dropoffArea: dropoff, seats },
  });
}

describe("pool capacity + concurrency", () => {
  it("never exceeds Bullet's capacity", async () => {
    const driver = await freshDriverWithCapacity(3);
    const r1 = await makeRequest(2);
    const r2 = await makeRequest(2); // 2 + 2 = 4 > 3

    await acceptRideRequest(prisma, driver.id, r1.id); // fills 2/3
    // Second compatible rider needs 2 seats but only 1 remains -> new pool, not overbooked.
    const res2 = await acceptRideRequest(prisma, driver.id, r2.id);

    const pool1 = await prisma.pool.findFirst({ where: { teslaId: driver.tesla!.id }, orderBy: { createdAt: "asc" } });
    expect(pool1!.seatsUsed).toBeLessThanOrEqual(3);
    expect(res2.poolId).not.toBe(pool1!.id); // couldn't fit -> opened its own pool
  });

  it("survives two concurrent claims on the last seat without overbooking", async () => {
    const driver = await freshDriverWithCapacity(3);
    const opener = await makeRequest(2);        // fills 2/3, opens the pool
    await acceptRideRequest(prisma, driver.id, opener.id);

    // Two riders each want the 1 remaining seat, fired at the same instant.
    const a = await makeRequest(1);
    const b = await makeRequest(1);
    const results = await Promise.allSettled([
      acceptRideRequest(prisma, driver.id, a.id),
      acceptRideRequest(prisma, driver.id, b.id),
    ]);

    // Re-read the pool: seatsUsed must be exactly 3, never 4.
    const pool = await prisma.pool.findFirst({ where: { teslaId: driver.tesla!.id, status: "OPEN" } });
    const pooledInto = results.filter(
      (r) => r.status === "fulfilled" && r.value.poolId === pool?.id
    ).length;

    // At most one of the two racers joined the original pool; capacity intact.
    expect(pool!.seatsUsed).toBeLessThanOrEqual(3);
    expect(pooledInto).toBeLessThanOrEqual(1);
  });

    afterAll(async () => {
    // Remove only this suite's test data (pools first, then users cascade the rest).
    await prisma.pool.deleteMany({ where: { tesla: { driver: { email: { contains: "@t.dev" } } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@t.dev" } } });
    await prisma.$disconnect();
  });
});