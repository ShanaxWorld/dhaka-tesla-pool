// src/app/passenger/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// Areas listed along the corridor your fare model uses.
const AREAS: [string, string][] = [
  ["UTTARA", "Uttara"], ["BASHUNDHARA", "Bashundhara"], ["BANANI", "Banani"],
  ["GULSHAN_2", "Gulshan 2"], ["GULSHAN_1", "Gulshan 1"], ["MOHAKHALI", "Mohakhali"],
  ["FARMGATE", "Farmgate"], ["DHANMONDI", "Dhanmondi"], ["MIRPUR", "Mirpur"],
];

const STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "Waiting", cls: "bg-gray-100 text-gray-700" },
  MATCHED: { label: "Matched", cls: "bg-blue-100 text-blue-700" },
  DRIVER_ARRIVED: { label: "Driver arrived", cls: "bg-amber-100 text-amber-700" },
  STARTED: { label: "In progress", cls: "bg-emerald-100 text-emerald-700" },
  COMPLETED: { label: "Completed", cls: "bg-emerald-600 text-white" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
};

const CANCELLABLE = ["REQUESTED", "MATCHED", "DRIVER_ARRIVED"];
const label = (v: string) => AREAS.find((a) => a[0] === v)?.[1] ?? v;
const taka = (paisa: number) => "৳ " + (paisa / 100).toFixed(2); // money stored in paisa

type Ride = {
  id: string; pickupArea: string; dropoffArea: string; seats: number;
  status: string; poolId: string | null;
  baseFare: number; distanceCharge: number; poolDiscount: number; totalFare: number;
};

export default function PassengerPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [seats, setSeats] = useState(1);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRides = useCallback(async () => {
    try {
      const d = await api<{ rides: Ride[] }>("/api/rides");
      setRides(d.rides);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  // Who am I? (guards the page)
  useEffect(() => {
    api<{ user: { name: string } | null }>("/api/auth/me")
      .then((d) => (d.user ? setUser(d.user) : router.replace("/login")))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  // Poll rides so status stays fresh as the driver advances the trip.
  useEffect(() => {
    loadRides();
    const t = setInterval(loadRides, 4000);
    return () => clearInterval(t);
  }, [loadRides]);

  // Live fare estimate whenever both areas are chosen.
  useEffect(() => {
    if (!pickup || !dropoff || pickup === dropoff) { setEstimate(null); return; }
    api<{ fare: { totalFare: number } }>(`/api/rides/estimate?pickup=${pickup}&dropoff=${dropoff}`)
      .then((d) => setEstimate(d.fare.totalFare))
      .catch(() => setEstimate(null));
  }, [pickup, dropoff]);

  async function requestRide() {
    setError("");
    if (!pickup || !dropoff) return setError("Pick both a pickup and dropoff.");
    if (pickup === dropoff) return setError("Pickup and dropoff must differ.");
    setBusy(true);
    try {
      await api("/api/rides", {
        method: "POST",
        body: JSON.stringify({ pickupArea: pickup, dropoffArea: dropoff, seats }),
      });
      setPickup(""); setDropoff(""); setSeats(1); setEstimate(null);
      await loadRides();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request ride");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    try {
      await api(`/api/rides/${id}`, { method: "DELETE" });
      await loadRides();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) return <main className="p-8 text-gray-500">Loading…</main>;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hello, {user?.name}</h1>
          <p className="text-sm text-gray-500">Request a ride and share a Tesla.</p>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">Log out</button>
      </div>

      {/* Request form */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Pickup</span>
            <select value={pickup} onChange={(e) => setPickup(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Select area</option>
              {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Dropoff</span>
            <select value={dropoff} onChange={(e) => setDropoff(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Select area</option>
              {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Seats</span>
            <select value={seats} onChange={(e) => setSeats(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {estimate !== null && (
            <p className="text-sm text-gray-600">
              Estimated fare <span className="font-semibold text-gray-900">{taka(estimate)}</span>
              <span className="text-gray-400"> (solo — pooling lowers it)</span>
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button onClick={requestRide} disabled={busy}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Requesting…" : "Request ride"}
        </button>
      </div>

      {/* Ride list */}
      <h2 className="mt-8 mb-3 text-sm font-medium text-gray-500">Your rides</h2>
      {rides.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          No rides yet. Request one above.
        </p>
      ) : (
        <div className="space-y-3">
          {rides.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-700" };
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{label(r.pickupArea)} → {label(r.dropoffArea)}</p>
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + s.cls}>{s.label}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
                  <span>{r.seats} seat{r.seats > 1 ? "s" : ""}{r.poolId ? " · pooled" : ""}</span>
                  <span className="font-semibold text-gray-900">{taka(r.totalFare)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  base {taka(r.baseFare)} + distance {taka(r.distanceCharge)}
                  {r.poolDiscount > 0 ? ` − pool discount ${taka(r.poolDiscount)}` : ""}
                </p>
                {CANCELLABLE.includes(r.status) && (
                  <button onClick={() => cancel(r.id)}
                    className="mt-3 text-xs text-red-600 hover:text-red-700">Cancel ride</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}