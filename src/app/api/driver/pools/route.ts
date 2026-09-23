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
  if (!tesla) return NextResponse.json({ error: "No Tesla" }, { status: 404 });

  const pools = await prisma.pool.findMany({
    where: { teslaId: tesla.id },
    include: {
      members: {
        select: { id: true, pickupArea: true, dropoffArea: true, seats: true, status: true, totalFare: true,
          passenger: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tesla: { name: tesla.name, capacity: tesla.capacity, seatsOnline: tesla.isOnline }, pools });
}