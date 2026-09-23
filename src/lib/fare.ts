import { Area } from "@prisma/client";

/**
 * FARE MODEL (all money in paisa — integers, never floats).
 * passengerFare = baseFare + distanceCharge - poolDiscount
 *
 *  - baseFare: flat 3000 paisa (৳30) per passenger.
 *  - distanceCharge: 2000 paisa (৳20) per "zone hop" between pickup and dropoff.
 *  - poolDiscount: if the passenger shares the Tesla, 20% off (base + distance).
 *
 * Zone distance is a fixed lookup (no map API) — documented and consistent.
 */

const BASE_FARE = 3000;          // ৳30
const PER_ZONE = 2000;           // ৳20 per hop
const POOL_DISCOUNT_RATE = 0.2;  // 20% off when pooled

// Ordered corridor of Dhaka areas; distance = |index difference|.
const AREA_ORDER: Area[] = [
  Area.UTTARA, Area.BASHUNDHARA, Area.BANANI, Area.GULSHAN_2,
  Area.GULSHAN_1, Area.MOHAKHALI, Area.FARMGATE, Area.DHANMONDI, Area.MIRPUR,
];

export function zoneDistance(from: Area, to: Area): number {
  const a = AREA_ORDER.indexOf(from);
  const b = AREA_ORDER.indexOf(to);
  return Math.abs(a - b);
}

export type FareBreakdown = {
  baseFare: number;
  distanceCharge: number;
  poolDiscount: number;
  totalFare: number;
};

export function calculateFare(from: Area, to: Area, pooled: boolean): FareBreakdown {
  const baseFare = BASE_FARE;
  const distanceCharge = zoneDistance(from, to) * PER_ZONE;
  const subtotal = baseFare + distanceCharge;
  const poolDiscount = pooled ? Math.round(subtotal * POOL_DISCOUNT_RATE) : 0;
  return { baseFare, distanceCharge, poolDiscount, totalFare: subtotal - poolDiscount };
}