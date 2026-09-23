import { PoolStatus, RideStatus } from "@prisma/client";

/**
 * POOL STATE MACHINE — the only legal forward transitions.
 * OPEN → ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED
 * (CANCELLED is handled separately, on the passenger's ride, not here.)
 *
 * A driver "accepting" opened the pool (OPEN). From there the driver
 * advances the shared trip. Each pool stage maps to a passenger ride stage.
 */
export const POOL_TRANSITIONS: Record<PoolStatus, PoolStatus[]> = {
  OPEN: ["ACCEPTED"],
  ACCEPTED: ["DRIVER_ARRIVED"],
  DRIVER_ARRIVED: ["STARTED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: PoolStatus, to: PoolStatus): boolean {
  return POOL_TRANSITIONS[from].includes(to);
}

// When the pool reaches a stage, each member ride moves to its matching stage.
export const POOL_TO_RIDE: Record<PoolStatus, RideStatus | null> = {
  OPEN: null,
  ACCEPTED: "MATCHED",
  DRIVER_ARRIVED: "DRIVER_ARRIVED",
  STARTED: "STARTED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};