import { NextResponse } from "next/server";
import { z } from "zod";
import { Area } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";

const schema = z.object({
  isOnline: z.boolean(),
  currentArea: z.nativeEnum(Area).optional(),
});

export async function PATCH(request: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user.role !== "DRIVER") {
    return NextResponse.json({ error: "Only drivers can change status" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const tesla = await prisma.tesla.update({
    where: { driverId: user.id },
    data: {
      isOnline: parsed.data.isOnline,
      ...(parsed.data.currentArea ? { currentArea: parsed.data.currentArea } : {}),
    },
  });
  return NextResponse.json({ tesla });
}