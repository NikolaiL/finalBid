"use client";

import { useEffect } from "react";
import { QueryFunction, QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";

const baseUrl = (process.env.NEXT_PUBLIC_PONDER_URL ?? "http://localhost:42069").replace(/\/$/, "");
const liveUrl = `${baseUrl}/live/data`;

console.log("liveUrl", liveUrl);

// Window-scoped singleton to avoid multiple EventSource connections across modules/chunks.
type GlobalLive = {
  es: EventSource | null;
  listeners: Set<() => void>;
  debounceTimer: any;
};

function getGlobal(): GlobalLive {
  if (typeof window === "undefined") {
    return { es: null, listeners: new Set(), debounceTimer: null };
  }
  const w = window as any;
  if (!w.__PONDER_DATA_LIVE__) {
    w.__PONDER_DATA_LIVE__ = { es: null, listeners: new Set(), debounceTimer: null } as GlobalLive;
  }
  return w.__PONDER_DATA_LIVE__ as GlobalLive;
}

function ensureSharedES() {
  const g = getGlobal();
  if (g.es) return;
  g.es = new EventSource(liveUrl);
  const emit = () => {
    if (g.debounceTimer) return;
    g.debounceTimer = setTimeout(() => {
      g.debounceTimer = null;
      g.listeners.forEach(fn => {
        try {
          fn();
        } catch {}
      });
    }, 250);
  };
  g.es.addEventListener("message", emit);
  g.es.addEventListener("error", () => {
    // Allow automatic reconnection; listeners remain registered.
  });
}

type Opts<T> = {
  queryKey: QueryKey;
  queryFn: QueryFunction<T>;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export function useDataLiveQuery<T = unknown>(opts: Opts<T>) {
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureSharedES();
    const g = getGlobal();
    const onMsg = () => {
      queryClient.invalidateQueries({ queryKey: opts.queryKey });
    };
    g.listeners.add(onMsg);
    return () => {
      g.listeners.delete(onMsg);
    };
  }, [queryClient, opts.queryKey]);

  return useQuery<T>({
    queryKey: opts.queryKey,
    queryFn: opts.queryFn,
    staleTime: opts.staleTime ?? 0,
    refetchOnWindowFocus: opts.refetchOnWindowFocus ?? false,
  });
}
