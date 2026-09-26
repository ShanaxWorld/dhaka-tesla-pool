// src/app/driver/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const AREAS: [string, string][] = [
  ["UTTARA", "Uttara"], ["BASHUNDHARA", "Bashundhara"], ["BANANI", "Banani"],
  ["GULSHAN_2", "Gulshan 2"], ["GULSHAN_1", "Gulshan 1"], ["MOHAKHALI", "Mohakhali"],
  ["FARMGATE", "Farmgate"], ["DHANMONDI", "Dhanmondi"], ["MIRPUR", "Mirpur"],
];
const label = (v: string) => AREAS.find((a) => a[0] === v)?.[1] ?? v;
const taka = (paisa: number) => "৳ " + (paisa / 100).toFixed(2);

// The one legal next step for a pool, and the button copy for it.
const NEXT: Record<string, { to: string; label: string } | null> = {
  OPEN: { to: "ACCEPTED", label: "Confirm pool" },
  ACCEPTED: { to: "DRIVER_ARRIVED", label: "Mark arrived" },
  DRIVER_ARRIVED: { to: "STARTED", label: "Start trip" },
  STARTED: { to: "COMPLETED", label: "Complete trip" },
  COMPLETED: null,
  CANCELLED: null,
};

const POOL_BADGE: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "bg-gray-100 text-gray-700" },
  ACCEPTED: { label: "Accepted", cls: "bg-blue-100 text-blue-700" },
  DRIVER_ARRIVED: { label: "Arrived", cls: "bg-amber-100 text-amber-700" },
  STARTED: { label: "In progress", cls: "bg-emerald-100 text-emerald-700" },
  COMPLETED: { label: "Completed", cls: "bg-emerald-600 text-white" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
};

type Tesla = { name: string; capacity: number; isOnline: boolean; currentArea: string | null };
type Req = { id: string; pickupArea: string; dropoffArea: string; seats: number; totalFare: number; passenger: { name: string } };
type Member = { id: string; pickupArea: string; dropoffArea: string; seats: number; status: string; totalFare: number; passenger: { name: string } };
type Pool = { id: string; status: string; seatsUsed: number; pickupArea: string; members: Member[] };

export default function DriverPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tesla, setTesla] = useState<Tesla | null>(null);
  const [requests, setRequests] = useState<Req[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api<{ tesla: Tesla; requests: Req[]; pools: Pool[] }>("/api/driver/dashboard");
      setTesla(d.tesla); setRequests(d.requests); setPools(d.pools);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    api<{ user: { name: string } | null }>("/api/auth/me")
      .then((d) => (d.user ? setName(d.user.name) : router.replace("/login")))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(next: Partial<{ isOnline: boolean; currentArea: string }>) {
    if (!tesla) return;
    try {
      await api("/api/driver/status", {
        method: "PATCH",
        body: JSON.stringify({
          isOnline: next.isOnline ?? tesla.isOnline,
          ...((next.currentArea ?? tesla.currentArea) ? { currentArea: next.currentArea ?? tesla.currentArea } : {}),
        }),
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update status"); }
  }

  async function accept(rideRequestId: string) {
    setError("");
    try { await api("/api/driver/accept", { method: "POST", body: JSON.stringify({ rideRequestId }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not accept"); }
  }

  async function advance(poolId: string, to: string) {
    setError("");
    try { await api(`/api/driver/pools/${poolId}/advance`, { method: "POST", body: JSON.stringify({ to }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not advance"); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) return <main className="p-8 text-gray-500">Loading…</main>;

  const active = pools.filter((p) => p.status !== "COMPLETED" && p.status !== "CANCELLED");
  const history = pools.filter((p) => p.status === "COMPLETED" || p.status === "CANCELLED");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Driver — {name}</h1>
          <p className="text-sm text-gray-500">{tesla?.name} · {tesla?.capacity} seats</p>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">Log out</button>
      </div>

      {/* Status card */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <button
          onClick={() => setStatus({ isOnline: !tesla?.isOnline })}
          className={"rounded-lg px-4 py-2 text-sm font-medium text-white " + (tesla?.isOnline ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-400 hover:bg-gray-500")}
        >
          {tesla?.isOnline ? "Online" : "Offline"}
        </button>
        <label className="text-sm text-gray-600">
          Location{" "}
          <select
            value={tesla?.currentArea ?? ""}
            onChange={(e) => setStatus({ currentArea: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">Not set</option>
            {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Waiting requests */}
      <h2 className="mt-8 mb-3 text-sm font-medium text-gray-500">Waiting requests</h2>
      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">No one's waiting right now.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <p className="font-medium text-gray-900">{r.passenger.name}</p>
                <p className="text-sm text-gray-500">{label(r.pickupArea)} → {label(r.dropoffArea)} · {r.seats} seat{r.seats > 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => accept(r.id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Accept</button>
            </div>
          ))}
        </div>
      )}

      {/* Active pools */}
      <h2 className="mt-8 mb-3 text-sm font-medium text-gray-500">Active pools</h2>
      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">No active pools. Accept a request to start one.</p>
      ) : (
        <div className="space-y-3">
          {active.map((p) => {
            const badge = POOL_BADGE[p.status];
            const next = NEXT[p.status];
            return (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">Pool from {label(p.pickupArea)}</p>
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + badge.cls}>{badge.label}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{p.seatsUsed}/{tesla?.capacity} seats filled</p>
                <div className="mt-3 space-y-1">
                  {p.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className={m.status === "CANCELLED" ? "text-gray-400 line-through" : "text-gray-700"}>
                        {m.passenger.name}: {label(m.pickupArea)} → {label(m.dropoffArea)}
                      </span>
                      <span className="font-medium text-gray-900">{taka(m.totalFare)}</span>
                    </div>
                  ))}
                </div>
                {next && (
                  <button onClick={() => advance(p.id, next.to)} className="mt-4 w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800">
                    {next.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium text-gray-500">History</h2>
          <div className="space-y-2">
            {history.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
                <span className="text-gray-600">{label(p.pickupArea)} · {p.members.length} rider{p.members.length > 1 ? "s" : ""}</span>
                <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + POOL_BADGE[p.status].cls}>{POOL_BADGE[p.status].label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}