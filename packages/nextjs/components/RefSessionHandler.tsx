"use client";

import { useEffect } from "react";

export default function RefSessionHandler() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      console.log("url", url);
      // Support both ?ref=... and &ref=... (legacy)
      let ref = url.searchParams.get("ref");
      // Also support clean URLs like /0xabc...[/timestamp]
      if (!ref) {
        const path = url.pathname.replace(/^\/+|\/+$/g, "");
        const first = path.split("/")[0] || "";
        if (/^0x[a-fA-F0-9]{40}$/.test(first)) {
          ref = first;
        }
      }
      if (!ref && url.href.includes("&ref=")) {
        ref = url.href.split("&ref=")[1]?.split(/[&#]/)[0];
      }
      if (!ref && url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        ref = hashParams.get("ref") || ref;
      }
      if (ref) {
        sessionStorage.setItem("referrer", ref);
        console.log("referrer stored", ref);
      }
    }
  }, []);
  return null;
}
