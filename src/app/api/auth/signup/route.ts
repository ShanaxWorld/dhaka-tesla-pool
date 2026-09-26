// src/app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, AUTH_COOKIE, authCookieOptions } from "@/lib/auth";

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["PASSENGER", "DRIVER"]).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const finalRole = role ?? "PASSENGER";

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: finalRole,
      // A driver owns exactly one Tesla — provision a default 3-seater on signup.
      ...(finalRole === "DRIVER"
        ? { tesla: { create: { name: name + "'s Tesla", capacity: 3 } } }
        : {}),
    },
    select: { id: true, name: true, email: true, role: true },
  });

  const token = signToken({ userId: user.id, role: user.role });
  const res = NextResponse.json({ user }, { status: 201 });
  res.cookies.set(AUTH_COOKIE, token, authCookieOptions());
  return res;
}