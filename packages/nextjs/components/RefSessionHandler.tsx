"use client";

import { useEffect } from "react";

export default function RefSessionHandler() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      // Support both ?ref=... and &ref=... (legacy)
      let ref = url.searchParams.get("ref");
      if (!ref && url.href.includes("&ref=")) {
        ref = url.href.split("&ref=")[1]?.split(/[&#]/)[0];
      }
      if (ref) {
        sessionStorage.setItem("referrer", ref);
        console.log("referrer stored", ref);
      }
    }
  }, []);
  return null;
}
