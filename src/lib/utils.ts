import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Mastery colour: <50 terracotta, <70 clay, else sage. */
/**
 * Mastery band -> bar fill. The Swiss system has no colour to signal with, so weight does it:
 * the weakest band is solid ink because it is the one that wants attention, and a band that
 * needs nothing from you recedes to a light grey. The bar's length still carries the value.
 */
export function tone(pct: number) {
  if (pct < 50) return '#0b0b0b';
  if (pct < 70) return '#6e6e6e';
  return '#c9c9c9';
}
