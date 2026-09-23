import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;

  const ride = await prisma.rideRequest.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!ride) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ride.passengerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 }); // can't view others' rides
  }
  return NextResponse.json({ ride });
}

// Cancel — allowed only before the trip has started.
const CANCELLABLE = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED"];

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await params;

  const ride = await prisma.rideRequest.findUnique({ where: { id } });
  if (!ride) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ride.passengerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!CANCELLABLE.includes(ride.status)) {
    return NextResponse.json({ error: `Cannot cancel a ${ride.status} ride` }, { status: 409 });
  }

  const updated = await prisma.rideRequest.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      events: { create: { fromStatus: ride.status, toStatus: "CANCELLED", note: "Cancelled by passenger" } },
    },
  });
  return NextResponse.json({ ride: updated });
}