type FarcasterUser = {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
};

type ApiResponse = { user: null | any };

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const memoryCache = new Map<string, { user: FarcasterUser | null; expiresAt: number }>();
const cacheKeyFor = (addr: string) => `farUser:${addr}`;
const inFlightRequests = new Map<string, Promise<FarcasterUser | null>>();

/**
 * Fetches Farcaster user data for a given address with caching
 * @param address - The Ethereum address to look up
 * @returns Promise that resolves to FarcasterUser or null
 */
export const getFarcasterUser = async (address: string): Promise<FarcasterUser | null> => {
  if (!address) return null;

  const checksum = address.toLowerCase();
  const now = Date.now();

  // 1) Check in-memory cache
  const mem = memoryCache.get(checksum);
  if (mem && mem.expiresAt > now) {
    return mem.user;
  }

  // 2) Check localStorage cache
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(cacheKeyFor(checksum));
      if (raw) {
        const parsed = JSON.parse(raw) as { user: FarcasterUser | null; expiresAt: number };
        if (parsed && parsed.expiresAt > now) {
          memoryCache.set(checksum, parsed);
          return parsed.user;
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  // 3) Fetch and populate caches with in-flight deduplication
  const runFetch = () => {
    const url = `/api/farcaster-user?address=${checksum}`;
    const p = fetch(url)
      .then(res => res.json())
      .then((json: ApiResponse) => {
        const u = json?.user;
        const fcUser: FarcasterUser | null = u
          ? { fid: u.fid, username: u.username, display_name: u.display_name, pfp_url: u.pfp_url }
          : null;
        const record = { user: fcUser, expiresAt: now + CACHE_TTL_MS };
        memoryCache.set(checksum, record);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(cacheKeyFor(checksum), JSON.stringify(record));
          }
        } catch {
          // ignore storage errors
        }
        return fcUser;
      })
      .finally(() => {
        inFlightRequests.delete(checksum);
      });
    inFlightRequests.set(checksum, p);
    return p;
  };

  const inFlight = inFlightRequests.get(checksum) || runFetch();
  return inFlight;
};

/**
 * Gets a display name for an address, preferring Farcaster username if available
 * @param address - The Ethereum address
 * @param fallbackFormat - Format to use if no username is available (default: short)
 * @returns Promise that resolves to display string
 */
export const getAddressDisplayName = async (
  address: string,
  fallbackFormat: "short" | "long" = "short",
): Promise<string> => {
  if (!address) return "";

  const user = await getFarcasterUser(address);
  if (user?.username) {
    return `@${user.username}`;
  }

  // Fallback to address format
  if (fallbackFormat === "long") {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
