import { Area } from "@prisma/client";
import { zoneDistance } from "@/lib/fare";

/**
 * POOL MATCHING RULE (deliberately simple, no map API):
 * Two ride requests are poolable in the same Tesla if BOTH:
 *   1. Same pickup zone — they board in the same area.
 *   2. Compatible direction — dropoffs are close on the area corridor
 *      (within COMPAT_HOPS zones of each other).
 *
 * This is why Nusrat (Banani→Mohakhali) and Rafiq (Banani→Gulshan 1)
 * pool: same pickup (Banani), and Mohakhali/Gulshan 1 are adjacent on
 * the corridor — overlapping but not identical trips.
 */

const COMPAT_HOPS = 2;

export function areCompatible(
  aPickup: Area, aDropoff: Area,
  bPickup: Area, bDropoff: Area,
): boolean {
  if (aPickup !== bPickup) return false;
  return zoneDistance(aDropoff, bDropoff) <= COMPAT_HOPS;
}