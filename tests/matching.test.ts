// tests/matching.test.ts
import { describe, it, expect } from "vitest";
import { Area } from "@prisma/client";
import { areCompatible } from "@/lib/matching";

describe("pool matching rule", () => {
  it("pools Nusrat and Rafiq — same pickup, nearby dropoffs", () => {
    expect(areCompatible(Area.BANANI, Area.MOHAKHALI, Area.BANANI, Area.GULSHAN_1)).toBe(true);
  });

  it("rejects riders boarding in different zones", () => {
    expect(areCompatible(Area.BANANI, Area.MOHAKHALI, Area.MIRPUR, Area.GULSHAN_1)).toBe(false);
  });

  it("rejects riders heading far apart", () => {
    expect(areCompatible(Area.BANANI, Area.GULSHAN_1, Area.BANANI, Area.MIRPUR)).toBe(false);
  });
});