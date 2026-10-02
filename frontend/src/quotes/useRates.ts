import { useEffect, useState } from "react";

import { parseRates, type RatesSnapshot } from "./quotes.ts";

/** Fetches the body of `GET /api/rates`; rejects when there is none. */
export type LoadRates = (signal: AbortSignal) => Promise<unknown>;

export const fetchRates: LoadRates = async (signal) => {
  const response = await fetch("/api/rates", { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`GET /api/rates answered ${String(response.status)}`);
  }
  return response.json();
};

/** The calculator never waits for the backend: after this, the fields simply stay empty. */
const TIMEOUT = 8_000;

/** Ages are shown in minutes: refresh them, and turn a fresh price stale, about this often. */
const TICK = 30_000;

export interface Rates {
  readonly snapshot: RatesSnapshot;
  /** The backend's clock now: its time when it answered plus what has passed here since. */
  readonly now: number;
}

/**
 * The latest prices, asked for once, or null while they have not arrived or when the backend
 * does not answer. A failure is only logged: the form works the same without them.
 */
export function useRates(load: LoadRates = fetchRates): Rates | null {
  const [loaded, setLoaded] = useState<{
    readonly snapshot: RatesSnapshot;
    readonly receivedAt: number;
  } | null>(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let unmounted = false;
    const timer = setTimeout(() => {
      controller.abort();
    }, TIMEOUT);
    load(controller.signal)
      .then((body) => {
        const snapshot = parseRates(body);
        if (snapshot === null) {
          throw new Error("GET /api/rates answered something that is not a list of prices");
        }
        if (!unmounted) {
          const receivedAt = Date.now();
          setLoaded({ snapshot, receivedAt });
          setClock(receivedAt);
        }
      })
      .catch((error: unknown) => {
        if (!unmounted) {
          console.warn("The latest prices could not be loaded; the fields stay empty.", error);
        }
      })
      .finally(() => {
        clearTimeout(timer);
      });
    return () => {
      unmounted = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (loaded === null) {
      return;
    }
    const interval = setInterval(() => {
      setClock(Date.now());
    }, TICK);
    return () => {
      clearInterval(interval);
    };
  }, [loaded]);

  return loaded === null
    ? null
    : { snapshot: loaded.snapshot, now: loaded.snapshot.serverTime + (clock - loaded.receivedAt) };
}
