import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Returns the user, or a ready-to-return 401 response.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, error: null };
}