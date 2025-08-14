"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Address as AddressBase } from "./Address";
import { AddressCopyIcon } from "./AddressCopyIcon";
import type { Address as AddressType } from "viem";
import { getAddress, isAddress } from "viem";
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

  useEffect(() => {
    let cancelled = false;
    setUser(null);
    setFetched(false);
    if (!checksum || !isAddress(checksum)) return;

    const url = `/api/farcaster-user?address=${checksum}`;
    fetch(url)
      .then(res => res.json())
      .then((json: ApiResponse) => {
        if (cancelled) return;
        const u = json?.user;
        if (u) {
          setUser({
            fid: u.fid,
            username: u.username,
            display_name: u.display_name,
            pfp_url: u.pfp_url,
          });
        }
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

  const profileUrl = user.username ? `https://warpcast.com/${user.username}` : `https://warpcast.com/fid/${user.fid}`;

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
            className="rounded-full object-cover"
          />
        ) : (
          <BlockieAvatar address={checksum} size={avatarSize} />
        )}
      </div>
      <div className="flex flex-col">
        {user.username ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={`ml-1.5 ${textSizeMap[size]} font-bold`}
          >
            @{user.username}
          </a>
        ) : null}
        <div className="flex">
          {disableAddressLink ? (
            <span className={`ml-1.5 ${textSizeMap[size]} font-normal`}>
              {format === "long" ? checksum : shortAddress}
            </span>
          ) : (
            <a
              href={profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={`ml-1.5 ${textSizeMap[size]} font-normal`}
            >
              {format === "long" ? checksum : shortAddress}
            </a>
          )}
          <AddressCopyIcon className={`ml-1 h-4 w-4 cursor-pointer`} address={checksum} />
        </div>
      </div>
    </div>
  );
};
