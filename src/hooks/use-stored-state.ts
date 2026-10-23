import { useCallback, useState } from "react";

/** Whether a stored value is the same kind as its fallback: a list, an object or the same type of value. */
export function sameKind(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === "object" && fallback !== null)
    return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === typeof fallback;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    // A damaged value would otherwise break the launcher on every start.
    return sameKind(value, fallback) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/** `useState` that survives restarts by mirroring its value to localStorage. */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage being full or unavailable only costs persistence.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update] as const;
}
