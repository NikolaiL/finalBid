"use client";

import { useEffect } from "react";
import { QueryFunction, QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";

const baseUrl = (process.env.NEXT_PUBLIC_PONDER_URL ?? "http://localhost:42069").replace(/\/$/, "");
const liveUrl = `${baseUrl}/live/data`;
//const liveUrl = `${baseUrl}/sql/live`;

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
  console.log("🚀 Creating new EventSource connection to:", liveUrl);
  g.es = new EventSource(liveUrl);
  const emit = () => {
    if (g.debounceTimer) return;
    g.debounceTimer = setTimeout(() => {
      g.debounceTimer = null;
      console.log("📨 Broadcasting data update to", g.listeners.size, "listeners");
      g.listeners.forEach(fn => {
        try {
          fn();
        } catch {}
      });
    }, 250);
  };
  g.es.addEventListener("message", event => {
    console.log("📬 EventSource message received:", event.data);
    emit();
  });
  g.es.addEventListener("open", () => {
    console.log("✅ EventSource connection opened");
  });
  g.es.addEventListener("error", err => {
    console.error("❌ EventSource error:", err);
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
    console.log("📡 useDataLiveQuery connecting to:", liveUrl);
    ensureSharedES();
    const g = getGlobal();
    const onMsg = () => {
      console.log("🔔 Live data update received, invalidating query:", opts.queryKey);
      queryClient.invalidateQueries({ queryKey: opts.queryKey });
    };
    g.listeners.add(onMsg);
    return () => {
      g.listeners.delete(onMsg);
    };
  }, [queryClient, opts.queryKey]);

  const result = useQuery<T>({
    queryKey: opts.queryKey,
    queryFn: opts.queryFn,
    staleTime: opts.staleTime ?? 5000, // 5 seconds default stale time
    refetchOnWindowFocus: opts.refetchOnWindowFocus ?? false,
  });

  console.log("🔍 useDataLiveQuery result:", {
    queryKey: opts.queryKey,
    isLoading: result.isLoading,
    isError: result.isError,
    error: result.error,
    dataLength: Array.isArray(result.data) ? result.data.length : "not array",
  });

  return result;
}
