import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET as string;
export const AUTH_COOKIE = "token";

export type JwtPayload = { userId: string; role: "PASSENGER" | "DRIVER" };

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function authCookieOptions() {
  return {
    httpOnly: true,                                  // JS can't read it → blocks XSS token theft
    secure: process.env.NODE_ENV === "production",   // HTTPS-only in prod
    sameSite: "lax" as const,                        // basic CSRF protection
    path: "/",
    maxAge: 60 * 60 * 24 * 7,                         // 7 days
  };
}

// Reads the cookie, verifies it, returns the current user (or null).
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, role: true },
  });
}