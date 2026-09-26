// src/app/api/driver/dashboard/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user.role !== "DRIVER") {
    return NextResponse.json({ error: "Drivers only" }, { status: 403 });
  }

  const tesla = await prisma.tesla.findUnique({ where: { driverId: user.id } });
  if (!tesla) return NextResponse.json({ error: "No Tesla for this driver" }, { status: 404 });

  // All un-matched requests the driver could pick up.
  const requests = await prisma.rideRequest.findMany({
    where: { status: "REQUESTED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, pickupArea: true, dropoffArea: true, seats: true, totalFare: true,
      passenger: { select: { name: true } },
    },
  });

  // This Tesla's pools, with members — active and finished (for history).
  const pools = await prisma.pool.findMany({
    where: { teslaId: tesla.id },
    orderBy: { createdAt: "desc" },
    include: {
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, pickupArea: true, dropoffArea: true, seats: true, status: true, totalFare: true,
          passenger: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    tesla: { name: tesla.name, capacity: tesla.capacity, isOnline: tesla.isOnline, currentArea: tesla.currentArea },
    requests,
    pools,
  });
}