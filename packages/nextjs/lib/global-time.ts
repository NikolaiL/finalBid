import { useCallback, useEffect, useState } from "react";

// Global time drift storage
let globalTimeDrift = 0;

// Global scheduler state
const globalScheduler: {
  isRunning: boolean;
  timeoutId: NodeJS.Timeout | null;
  subscribers: Set<() => void>;
  lastSyncTime: number; // Server time of last sync
  nextSyncTime: number; // Server time of next scheduled sync
} = {
  isRunning: false,
  timeoutId: null,
  subscribers: new Set(),
  lastSyncTime: 0,
  nextSyncTime: 0,
};

// Global sync function using Ponder status endpoint
async function globalSyncTime() {
  try {
    // Fetch from Ponder status endpoint to get server time
    const response = await fetch("/ponder/status", {
      method: "GET",
      cache: "no-cache",
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    // Get server time from response headers
    const serverTimeHeader = response.headers.get("date");
    if (!serverTimeHeader) {
      throw new Error("No date header found in response");
    }

    const serverTime = new Date(serverTimeHeader).getTime();
    const clientTime = Date.now();
    const drift = serverTime - clientTime;

    // If drift is under 1000ms, set it to 0 as it's negligible
    globalTimeDrift = Math.abs(drift) < 1000 ? 0 : drift;
    globalScheduler.lastSyncTime = serverTime;

    // Log all drift updates for debugging
    console.log("Time drift updated:", {
      serverTime: new Date(serverTime).toISOString(),
      clientTime: new Date(clientTime).toISOString(),
      drift: drift,
    });

    if (Math.abs(drift) > 30000) {
      // More than 30 seconds
      console.warn(
        `⚠️ Significant time drift detected: ${Math.round(drift / 1000)}s difference between server and client time`,
      );
    } else if (Math.abs(drift) < 1000) {
      console.log(`✅ Time drift is negligible (${Math.round(drift)}ms), using client time`);
    }

    // Schedule next sync based on server time (immune to local time changes)
    scheduleNextSync();

    // Notify all subscribers
    globalScheduler.subscribers.forEach(callback => callback());
  } catch (error) {
    console.error("Failed to sync with Ponder server time:", error);
  }
}

// Schedule next sync based on server time (immune to local time changes)
function scheduleNextSync() {
  if (globalScheduler.timeoutId) {
    clearTimeout(globalScheduler.timeoutId);
  }

  // Calculate next sync time in server time
  globalScheduler.nextSyncTime = globalScheduler.lastSyncTime + 30000; // 30 seconds from last sync

  // Calculate how long to wait in client time
  const currentServerTime = getServerTime();
  const timeUntilNextSync = globalScheduler.nextSyncTime - currentServerTime;

  // Use setTimeout with calculated delay
  globalScheduler.timeoutId = setTimeout(
    () => {
      globalSyncTime();
    },
    Math.max(1000, timeUntilNextSync),
  ); // Minimum 1 second delay
}

// Start global scheduler
function startGlobalScheduler() {
  if (globalScheduler.isRunning) return;

  globalScheduler.isRunning = true;

  // Initial sync
  globalSyncTime();
}

// Stop global scheduler
function stopGlobalScheduler() {
  if (!globalScheduler.isRunning) return;

  globalScheduler.isRunning = false;

  if (globalScheduler.timeoutId) {
    clearTimeout(globalScheduler.timeoutId);
    globalScheduler.timeoutId = null;
  }
}

/**
 * Hook to subscribe to Ponder server time drift updates.
 * Uses a global scheduler to avoid multiple timers and is immune to local time changes.
 */
export function useServerTimeDrift() {
  const [isSyncing, setIsSyncing] = useState(false);

  // Subscribe to global updates
  const handleSync = useCallback(() => {
    setIsSyncing(false); // Sync completed
  }, []);

  useEffect(() => {
    console.log("useServerTimeDrift: Subscribing to global scheduler");

    // Add subscriber
    globalScheduler.subscribers.add(handleSync);

    // Start scheduler if not running
    startGlobalScheduler();

    return () => {
      console.log("useServerTimeDrift: Unsubscribing from global scheduler");
      globalScheduler.subscribers.delete(handleSync);

      // Stop scheduler if no more subscribers
      if (globalScheduler.subscribers.size === 0) {
        stopGlobalScheduler();
      }
    };
  }, [handleSync]);

  return { isSyncing };
}

// Legacy alias for backward compatibility
export const useBlockchainTimeDrift = useServerTimeDrift;

/**
 * Get the current server-synchronized time.
 * This applies the stored drift to the current client time.
 */
export function getServerTime(): number {
  return Date.now() + globalTimeDrift;
}

/**
 * Get the current server-synchronized time as BigInt (seconds).
 */
export function getServerTimeBigInt(): bigint {
  return BigInt(Math.floor(getServerTime() / 1000));
}

/**
 * Format time ago using server-synchronized time.
 */
export function formatTimeAgo(timestampSeconds: number | bigint): string {
  const ts = typeof timestampSeconds === "bigint" ? Number(timestampSeconds) : timestampSeconds;
  const currentSeconds = Math.floor(getServerTime() / 1000);
  const diffSeconds = Math.max(0, currentSeconds - ts);

  if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

/**
 * Get remaining time until a target timestamp.
 */
export function getTimeRemaining(endTimeSeconds: bigint | number): number {
  const endTime = typeof endTimeSeconds === "bigint" ? Number(endTimeSeconds) : endTimeSeconds;
  const currentSeconds = Math.floor(getServerTime() / 1000);
  return Math.max(0, endTime - currentSeconds);
}

/**
 * Check if a timestamp has passed.
 */
export function isTimePassed(endTimeSeconds: bigint | number): boolean {
  return getTimeRemaining(endTimeSeconds) <= 0;
}

// Legacy aliases for backward compatibility
export const getBlockchainTime = getServerTime;
export const getBlockchainTimeBigInt = getServerTimeBigInt;
