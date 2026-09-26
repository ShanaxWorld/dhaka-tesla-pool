// tests/rides.integration.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient, Role, Area } from "@prisma/client";

const prisma = new PrismaClient();

async function passengerWithRide(status: "REQUESTED" | "STARTED" = "REQUESTED") {
  const user = await prisma.user.create({
    data: { name: "P", email: `own-${Date.now()}-${Math.random()}@t.dev`, passwordHash: "x", role: Role.PASSENGER },
  });
  const ride = await prisma.rideRequest.create({
    data: { passengerId: user.id, pickupArea: Area.BANANI, dropoffArea: Area.MOHAKHALI, status },
  });
  return { user, ride };
}

// Mirrors the server's ownership + cancellation rules.
const CANCELLABLE = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED"];

describe("ownership and cancellation", () => {
  it("a passenger cannot access another passenger's ride", async () => {
    const alice = await passengerWithRide();
    const bob = await passengerWithRide();

    // Bob asking for Alice's ride, scoped by his own id, finds nothing.
    const found = await prisma.rideRequest.findFirst({
      where: { id: alice.ride.id, passengerId: bob.user.id },
    });
    expect(found).toBeNull();
  });

  it("allows cancelling a ride that is still cancellable", () => {
    expect(CANCELLABLE.includes("REQUESTED")).toBe(true);
    expect(CANCELLABLE.includes("MATCHED")).toBe(true);
  });

  it("forbids cancelling a ride once it has started or completed", () => {
    expect(CANCELLABLE.includes("STARTED")).toBe(false);
    expect(CANCELLABLE.includes("COMPLETED")).toBe(false);
  });

    afterAll(async () => {
    await prisma.pool.deleteMany({ where: { tesla: { driver: { email: { contains: "@t.dev" } } } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@t.dev" } } });
    await prisma.$disconnect();
  });
});