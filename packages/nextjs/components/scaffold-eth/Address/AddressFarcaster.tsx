"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Address as AddressBase } from "./Address";
import { AddressCopyIcon } from "./AddressCopyIcon";
import type { Address as AddressType } from "viem";
import { getAddress, isAddress } from "viem";
import { useMiniapp } from "~~/components/MiniappProvider";
import { BlockieAvatar } from "~~/components/scaffold-eth";

type Size = "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";

const textSizeMap: Record<Size, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
};

const avatarPxMap: Record<Size, number> = {
  xs: 18,
  sm: 20,
  base: 24,
  lg: 28,
  xl: 32,
  "2xl": 40,
  "3xl": 48,
};

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

type AddressFarcasterProps = {
  address?: AddressType;
  disableAddressLink?: boolean;
  format?: "short" | "long";
  size?: Size;
  onlyEnsOrAddress?: boolean;
};

export const AddressFarcaster = ({
  address,
  disableAddressLink,
  format,
  size = "base",
  onlyEnsOrAddress,
}: AddressFarcasterProps) => {
  const checksum = useMemo(() => (address ? getAddress(address) : undefined), [address]);
  const shortAddress = useMemo(() => (checksum ? `${checksum.slice(0, 6)}...${checksum.slice(-4)}` : ""), [checksum]);

  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [fetched, setFetched] = useState(false);
  const { openProfile } = useMiniapp();

  useEffect(() => {
    let cancelled = false;
    setUser(null);
    setFetched(false);
    if (!checksum || !isAddress(checksum)) return;

    const now = Date.now();

    // 1) Check in-memory cache
    const mem = memoryCache.get(checksum);
    if (mem && mem.expiresAt > now) {
      setUser(mem.user);
      setFetched(true);
      return;
    }

    // 2) Check localStorage cache
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(cacheKeyFor(checksum));
        if (raw) {
          const parsed = JSON.parse(raw) as { user: FarcasterUser | null; expiresAt: number };
          if (parsed && parsed.expiresAt > now) {
            memoryCache.set(checksum, parsed);
            setUser(parsed.user);
            setFetched(true);
            return;
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
    inFlight
      .then(fcUser => {
        if (cancelled) return;
        setUser(fcUser);
      })
      .catch(() => void 0)
      .finally(() => {
        if (!cancelled) setFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [checksum]);

  if (!checksum || !isAddress(checksum)) {
    return (
      <AddressBase
        address={address}
        disableAddressLink={disableAddressLink}
        format={format}
        size={size}
        onlyEnsOrAddress={onlyEnsOrAddress}
      />
    );
  }

  if (!user && !fetched) {
    return (
      <AddressBase
        address={address}
        disableAddressLink={disableAddressLink}
        format={format}
        size={size}
        onlyEnsOrAddress={onlyEnsOrAddress}
      />
    );
  }

  if (!user) {
    return (
      <AddressBase
        address={address}
        disableAddressLink={disableAddressLink}
        format={format}
        size={size}
        onlyEnsOrAddress={onlyEnsOrAddress}
      />
    );
  }

  const avatarSize = avatarPxMap[size];

  return (
    <div className="flex items-center shrink-0">
      <div className="shrink-0">
        {user.pfp_url ? (
          <Image
            src={user.pfp_url}
            alt="Farcaster avatar"
            width={avatarSize}
            height={avatarSize}
            className="rounded-full object-cover cursor-pointer"
            onClick={() => openProfile({ fid: user.fid, username: user.username })}
          />
        ) : (
          <BlockieAvatar address={checksum} size={avatarSize} />
        )}
      </div>
      <div className="flex flex-col">
        {user.username ? (
          <button
            type="button"
            onClick={() => openProfile({ fid: user.fid, username: user.username })}
            className={`ml-1.5 ${textSizeMap[size]} font-bold text-left cursor-pointer`}
          >
            @{user.username}
          </button>
        ) : null}
        <div className="flex">
          {disableAddressLink ? (
            <span className={`ml-1.5 ${textSizeMap[size]} font-normal`}>
              {format === "long" ? checksum : shortAddress}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => openProfile({ fid: user.fid, username: user.username })}
              className={`ml-1.5 ${textSizeMap[size]} font-normal text-left`}
            >
              {format === "long" ? checksum : shortAddress}
            </button>
          )}
          <AddressCopyIcon className={`ml-1 h-4 w-4 cursor-pointer`} address={checksum} />
        </div>
      </div>
    </div>
  );
};
