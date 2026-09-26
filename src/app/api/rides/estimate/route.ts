// src/app/api/rides/estimate/route.ts
import { NextResponse } from "next/server";
import { Area } from "@prisma/client";
import { calculateFare } from "@/lib/fare";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pickup = searchParams.get("pickup");
  const dropoff = searchParams.get("dropoff");

  if (!pickup || !dropoff || !(pickup in Area) || !(dropoff in Area)) {
    return NextResponse.json({ error: "Invalid areas" }, { status: 400 });
  }
  if (pickup === dropoff) {
    return NextResponse.json({ error: "Pickup and dropoff must differ" }, { status: 400 });
  }

  const fare = calculateFare(pickup as Area, dropoff as Area, false); // solo estimate
  return NextResponse.json({ fare });
}