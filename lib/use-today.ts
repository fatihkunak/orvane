"use client";

import { useSyncExternalStore } from "react";

// Captured once per page load so the snapshot is referentially stable
// (useSyncExternalStore requires getSnapshot to return the same value between calls).
let loadedAt: Date | null = null;

const subscribe = () => () => {}; // the date never changes, nothing to subscribe to
const getSnapshot = () => (loadedAt ??= new Date());
const getServerSnapshot = () => null;

/**
 * Returns the browser's current date, or null on the server and during hydration.
 * Rendering "today" on the server would use the server's timezone and clock and
 * cause hydration mismatches, so date-dependent UI waits for the browser's value.
 */
export function useToday(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
