// tests/lifecycle.test.ts
import { describe, it, expect } from "vitest";
import { PoolStatus } from "@prisma/client";
import { canTransition } from "@/lib/lifecycle";

describe("pool state machine", () => {
  it("allows the legal forward path", () => {
    expect(canTransition(PoolStatus.OPEN, PoolStatus.ACCEPTED)).toBe(true);
    expect(canTransition(PoolStatus.ACCEPTED, PoolStatus.DRIVER_ARRIVED)).toBe(true);
    expect(canTransition(PoolStatus.DRIVER_ARRIVED, PoolStatus.STARTED)).toBe(true);
    expect(canTransition(PoolStatus.STARTED, PoolStatus.COMPLETED)).toBe(true);
  });

  it("rejects illegal jumps and reversals", () => {
    expect(canTransition(PoolStatus.OPEN, PoolStatus.STARTED)).toBe(false);       // skips stages
    expect(canTransition(PoolStatus.COMPLETED, PoolStatus.STARTED)).toBe(false);  // goes backward
    expect(canTransition(PoolStatus.COMPLETED, PoolStatus.ACCEPTED)).toBe(false);
  });
});