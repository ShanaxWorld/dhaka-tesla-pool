// tests/fare.test.ts
import { describe, it, expect } from "vitest";
import { Area } from "@prisma/client";
import { calculateFare, zoneDistance } from "@/lib/fare";

describe("fare model", () => {
  it("measures each trip's own distance", () => {
    expect(zoneDistance(Area.BANANI, Area.MOHAKHALI)).toBe(3);
    expect(zoneDistance(Area.BANANI, Area.GULSHAN_1)).toBe(2);
  });

  it("computes Nusrat's solo and pooled fare (Banani -> Mohakhali)", () => {
    const solo = calculateFare(Area.BANANI, Area.MOHAKHALI, false);
    expect(solo.totalFare).toBe(9000); // ৳90 solo

    const pooled = calculateFare(Area.BANANI, Area.MOHAKHALI, true);
    expect(pooled.poolDiscount).toBe(1800);
    expect(pooled.totalFare).toBe(7200); // ৳72 pooled
  });

  it("computes Rafiq's pooled fare (Banani -> Gulshan 1)", () => {
    const pooled = calculateFare(Area.BANANI, Area.GULSHAN_1, true);
    expect(pooled.totalFare).toBe(5600); // ৳56 pooled
  });

  it("keeps money as whole paisa (no floating point)", () => {
    const f = calculateFare(Area.BANANI, Area.MOHAKHALI, true);
    expect(Number.isInteger(f.totalFare)).toBe(true);
  });
});