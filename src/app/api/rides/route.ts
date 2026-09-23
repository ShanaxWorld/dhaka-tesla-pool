import { NextResponse } from "next/server";
import { z } from "zod";
import { Area } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { calculateFare } from "@/lib/fare";

const createSchema = z.object({
  pickupArea: z.nativeEnum(Area),
  dropoffArea: z.nativeEnum(Area),
  seats: z.number().int().min(1).max(3).default(1),
}).refine((d) => d.pickupArea !== d.dropoffArea, {
  message: "Pickup and dropoff must differ",
});

export async function POST(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user.role !== "PASSENGER") {
    return NextResponse.json({ error: "Only passengers can request rides" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { pickupArea, dropoffArea, seats } = parsed.data;

  // Estimated fare shown up front (solo/un-pooled at request time).
  const fare = calculateFare(pickupArea, dropoffArea, false);

  const ride = await prisma.rideRequest.create({
    data: {
      passengerId: user.id,
      pickupArea, dropoffArea, seats,
      baseFare: fare.baseFare,
      distanceCharge: fare.distanceCharge,
      poolDiscount: fare.poolDiscount,
      totalFare: fare.totalFare,
      events: { create: { toStatus: "REQUESTED", note: "Ride requested" } },
    },
  });

  return NextResponse.json({ ride }, { status: 201 });
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const rides = await prisma.rideRequest.findMany({
    where: { passengerId: user.id },        // only ever your own rides
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rides });
}