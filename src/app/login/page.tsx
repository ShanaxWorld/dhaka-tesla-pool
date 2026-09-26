// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const DEMO = [
  { label: "Jashim (driver)", email: "jashim@teslapool.dev" },
  { label: "Nusrat (passenger)", email: "nusrat@teslapool.dev" },
  { label: "Rafiq (passenger)", email: "rafiq@teslapool.dev" },
  { label: "Shirin (passenger)", email: "shirin@teslapool.dev" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"PASSENGER" | "DRIVER">("PASSENGER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        mode === "login" ? { email, password } : { name, email, password, role };
      const data = await api<{ user: { role: string } }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.replace(data.user.role === "DRIVER" ? "/driver" : "/passenger");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Dhaka Tesla Pool</h1>
          <p className="mt-1 text-sm text-gray-500">Share a seat. Split the fare.</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm">
            <button
              onClick={() => setMode("login")}
              className={"flex-1 rounded-md py-1.5 " + (mode === "login" ? "bg-white shadow text-gray-900" : "text-gray-500")}
            >
              Log in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={"flex-1 rounded-md py-1.5 " + (mode === "signup" ? "bg-white shadow text-gray-900" : "text-gray-500")}
            >
              Sign up
            </button>
          </div>

          <div className="space-y-3">
            {mode === "signup" && (
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {mode === "signup" && (
              <div className="flex gap-2 text-sm">
                {(["PASSENGER", "DRIVER"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={"flex-1 rounded-lg border py-2 " + (role === r ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-300 text-gray-600")}
                  >
                    {r === "PASSENGER" ? "Passenger" : "Driver"}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium text-gray-500">Demo accounts (password: password123)</p>
          <div className="flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                onClick={() => { setMode("login"); setEmail(d.email); setPassword("password123"); }}
                className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}