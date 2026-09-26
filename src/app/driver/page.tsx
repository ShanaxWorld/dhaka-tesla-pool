// src/app/driver/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function DriverPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: { name: string; role: string } }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) return <main className="p-8 text-gray-500">Loading…</main>;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Driver — {user?.name}</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">Log out</button>
      </div>
      <p className="mt-4 text-sm text-gray-500">Driver dashboard — coming up next.</p>
    </main>
  );
}