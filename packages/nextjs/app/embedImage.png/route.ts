import React from "react";
import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";
import { blo } from "blo";
import { formatToken, readTokenMeta } from "~~/lib/tokenMeta";

export const runtime = "nodejs";

// Helper function to format time remaining
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Ended";
  return `${seconds}`;
}

async function loadGoogleFont(font: string) {
  const url = `https://fonts.googleapis.com/css2?family=${font}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);

  if (resource) {
    const response = await fetch(resource[1]);
    if (response.status == 200) {
      return await response.arrayBuffer();
    }
  }

  throw new Error("failed to load font data");
}

// Helper function to generate default image when no auction is found
function generateDefaultImage() {
  return new ImageResponse(
    React.createElement(
      "div",
      {
        style: {
          width: "1200px",
          height: "800px",
          background: "#131517",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Rubik, sans-serif",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            width: "1040px",
            height: "500px",
            background: "#0A0F0F",
            borderRadius: "20px",
            border: "3px solid #1F2A3C",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
            boxShadow: "0 20px 20px #1e2a3c20",
          },
        },
        React.createElement(
          "span",
          {
            style: {
              fontSize: "48px",
              fontWeight: "700",
              color: "#666666",
              textAlign: "center",
            },
          },
          "Something is Cooking 🚀🚀🚀",
        ),
        React.createElement(
          "span",
          {
            style: {
              fontSize: "24px",
              fontWeight: "400",
              color: "#999999",
              textAlign: "center",
              marginTop: "20px",
            },
          },
          "Stay tuned!",
        ),
      ),
    ),
    {
      width: 1200,
      height: 800,
    },
  );
}

function transformImgurUrl(url: string): string {
  // Check if the URL is from imgur.com
  if (url?.includes("imgur.com")) {
    //console.log("transforming imgur url", url);
    // Encode the URL
    const encodedUrl = encodeURIComponent(url);
    // Return the Warpcast CDN proxy URL
    const result = `https://wrpcd.net/cdn-cgi/image/anim=false,fit=contain,f=auto,w=288/${encodedUrl}`;
    //console.log("transformed imgur url", result);
    return result;
  }
  return url;
}

export async function GET(req: NextRequest) {
  try {
    // Declare variables outside try block so they're accessible in the image generation
    let auctionAmountFormatted = "100";
    let timeRemainingFormatted = "300";
    let auction: any = null;
    let tokenMeta: { tokenAddress: `0x${string}`; symbol: string; decimals: number } | null = null;
    let isActive = false;
    let isWinner = false;
    let winnerData: any = null;

    // Base URL for absolute asset paths in OG generation
    const baseUrl = (process.env.NEXT_PUBLIC_URL ?? new URL(req.url).origin).replace(/\/$/, "");

    tokenMeta = await readTokenMeta();

    const tokenSymbol = tokenMeta?.symbol ?? "USDC";

    // Fetch current auction data from latest-auction endpoint

    try {
      // Determine the Ponder URL based on environment
      // Priority: NEXT_PUBLIC_PONDER_URL > PONDER_URL > construct from baseUrl
      let ponderUrl = process.env.NEXT_PUBLIC_PONDER_URL || process.env.PONDER_URL;

      // If no env var is set, construct it from the base URL
      if (!ponderUrl) {
        // If baseUrl contains the domain, use it with /ponder path
        ponderUrl = `${baseUrl}/ponder`;
      }

      const fetchUrl = `${ponderUrl}/latest-auction`;
      console.log("Fetching auction data from:", fetchUrl);
      console.log("Environment variables:", {
        NEXT_PUBLIC_PONDER_URL: process.env.NEXT_PUBLIC_PONDER_URL,
        PONDER_URL: process.env.PONDER_URL,
        baseUrl,
      });

      const response = await fetch(fetchUrl, {
        cache: "no-store", // Always fetch fresh data for OG images
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        console.error("Failed to fetch latest auction:", response.statusText);
        return generateDefaultImage();
      }

      const data = await response.json();
      console.log("Auction data received:", data);

      if (!data || data.error) {
        console.error("No auction data found in Ponder", ponderUrl);
        return generateDefaultImage();
      }

      // Data from endpoint has all fields as strings (BigInts are serialized)
      auction = {
        auctionId: data.auctionId || "0",
        hash: data.hash || "",
        auctionAmount: data.auctionAmount || "0",
        startTime: data.startTime || "0",
        endTime: data.endTime || "0",
        referralFee: data.referralFee || "0",
        deployerFee: data.deployerFee || "0",
        bidFee: data.bidFee || "0",
        bidCount: data.bidCount || 0,
        highestBidder: data.highestBidder || "",
        blockNumber: data.blockNumber || "0",
        logIndex: data.logIndex || 0,
        timestamp: data.timestamp || "0",
        ended: data.ended || false,
      };

      //console.log("auction", auction);

      // Check if auction is still active
      const now = Math.floor(Date.now() / 1000);
      isActive = !auction.ended && Number(auction.endTime) > now;
      //isActive = false;
      isWinner = auction.highestBidder && auction.highestBidder !== "0x0000000000000000000000000000000000000000";
      //isWinner = false;

      if (isWinner) {
        // Try to fetch Farcaster user data, but fallback to address if it fails
        try {
          const winnerDataResponse = await fetch(`${baseUrl}/api/farcaster-user?address=${auction.highestBidder}`);

          // Check if response is OK and is JSON
          if (winnerDataResponse.ok && winnerDataResponse.headers.get("content-type")?.includes("application/json")) {
            const winnerDataTemp = await winnerDataResponse.json();
            if (winnerDataTemp.user) {
              winnerData = {
                username: winnerDataTemp.user.username,
                profilePicture: transformImgurUrl(winnerDataTemp.user.pfp_url),
              };
            } else {
              // No user data, use address
              winnerData = {
                username: auction.highestBidder?.slice(0, 6) + "…" + auction.highestBidder?.slice(-4),
                profilePicture: blo(auction.highestBidder as `0x${string}`),
              };
            }
          } else {
            // Response not OK or not JSON, use address
            console.warn("Farcaster API returned non-JSON response, using address fallback");
            winnerData = {
              username: auction.highestBidder?.slice(0, 6) + "…" + auction.highestBidder?.slice(-4),
              profilePicture: blo(auction.highestBidder as `0x${string}`),
            };
          }
        } catch (error) {
          // Any error fetching user data, fallback to address
          console.warn("Error fetching Farcaster user data, using address fallback:", error);
          winnerData = {
            username: auction.highestBidder?.slice(0, 6) + "…" + auction.highestBidder?.slice(-4),
            profilePicture: blo(auction.highestBidder as `0x${string}`),
          };
        }
      }

      // Calculate time remaining
      const timeRemaining = Math.max(0, Number(auction.endTime) - now);
      timeRemainingFormatted = formatTimeRemaining(timeRemaining);

      // Safely format token amounts with fallbacks
      try {
        auctionAmountFormatted = formatToken(BigInt(auction.auctionAmount || "0"));
      } catch (formatError) {
        console.error("Error formatting USDC amounts:", formatError);
        // Use fallback values
        auctionAmountFormatted = "1.00";
      }

      // Validate auction data
      if (!auction.auctionAmount || !auction.endTime) {
        console.error("Invalid auction data - missing required fields:", {
          auctionAmount: auction.auctionAmount,
          endTime: auction.endTime,
        });
        return generateDefaultImage();
      }

      console.log("Auction data validated successfully:", {
        auctionId: auction.auctionId,
        auctionAmount: auctionAmountFormatted,
        isActive,
        isWinner,
        ended: auction.ended,
      });
    } catch (error) {
      console.error("Error fetching auction data from Ponder:", error);
      return generateDefaultImage();
    }

    const imageResponse = new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: "1200px",
            height: "800px", // 3:2 aspect ratio
            background: "#131517",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Rubik, sans-serif",
            position: "relative",
          },
        },
        // Main card container
        React.createElement(
          "div",
          {
            style: {
              width: "1040px",
              height: "500px",
              background: "#0A0F0F",
              borderRadius: "20px",
              border: "3px solid #1F2A3C",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
              boxShadow: "0 20px 20px #1e2a3c20",
              position: "relative",
            },
          },
          // Prize information
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                top: "30px",
              },
            },
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "48px",
                  fontWeight: "300",
                  color: "#FFFFFF",
                  marginRight: "8px",
                  fontFamily: "RubikLight",
                },
              },
              "Winning Pot",
            ),
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "100px",
                  fontFamily: "NotoSansBold",
                  color: "#fcff52",
                  marginRight: "8px",
                },
              },
              auctionAmountFormatted,
            ),
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "48px",
                  fontWeight: "300",
                  color: "#FFFFFF",
                  fontFamily: "RubikLight",
                },
              },
              tokenSymbol,
            ),
          ),

          // Auction timer (only when active). Otherwise, show the final winner block or a spacer
          isActive
            ? React.createElement(
                "div",
                {
                  style: {
                    textAlign: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "absolute",
                    top: "140px",
                  },
                },
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "24px",
                      fontWeight: "400",
                      color: "#FFFFFFA0",
                      marginRight: "8px",
                    },
                  },
                  "Game ends in",
                ),
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "36px",
                      fontWeight: "800",
                      fontFamily: "NotoSansBold",
                      color: "#9ae600",
                      paddingLeft: "10px",
                      paddingRight: "10px",
                    },
                  },
                  timeRemainingFormatted,
                ),
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "24px",
                      fontWeight: "400",
                      color: "#FFFFFFA0",
                      marginRight: "8px",
                    },
                  },
                  " seconds ",
                ),
              )
            : isWinner
              ? React.createElement(
                  "div",
                  {
                    style: {
                      top: "180px",
                      position: "absolute",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    },
                  },
                  React.createElement(
                    "span",
                    {
                      style: {
                        fontSize: "24px",
                        fontWeight: "400",
                        color: "#666666",
                        fontFamily: "Rubik",
                        marginRight: "16px",
                      },
                    },
                    `And the Winner is:`,
                  ),
                  React.createElement("img", {
                    src: winnerData.profilePicture,
                    width: 45,
                    height: 45,
                    style: { marginRight: "8px", borderRadius: "20px" },
                    alt: "Winner Profile Picture",
                  }),
                  React.createElement(
                    "span",
                    { style: { fontSize: "24px", fontWeight: "700", color: "#666666", fontFamily: "RubikBold" } },
                    `${winnerData.username}`,
                  ),
                )
              : React.createElement("div", {
                  style: { marginBottom: "20px", height: "85px" },
                }),

          // When active, show the current top bidder (compact row); otherwise nothing here
          isActive
            ? isWinner
              ? React.createElement(
                  "div",
                  {
                    style: {
                      position: "absolute",
                      top: "200px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    },
                  },
                  React.createElement(
                    "span",
                    {
                      style: {
                        fontSize: "24px",
                        fontWeight: "400",
                        color: "#FFFFFFC0",
                        fontFamily: "Rubik",
                        marginRight: "8px",
                      },
                    },
                    `Current winning player:`,
                  ),
                  React.createElement("img", {
                    src: winnerData.profilePicture,
                    width: 32,
                    height: 32,
                    style: { borderRadius: "20px" },
                    alt: "Current Top Bidder Profile Picture",
                  }),
                  React.createElement(
                    "span",
                    { style: { fontSize: "24px", fontWeight: "700", color: "#FFFFFFC0", fontFamily: "RubikBold" } },
                    `${winnerData.username}`,
                  ),
                )
              : null
            : null,

          // Bid button
          React.createElement(
            "div",
            {
              style: {
                width: "480px",
                height: "100px",
                background: "#fcff52",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                bottom: "120px",
                boxShadow: "0 8px 24px rgba(163, 110, 253, 0.3)",
              },
            },
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "40px",
                  fontWeight: "700",
                  color: "#000000",
                  fontFamily: "RubikBold",
                },
              },
              isActive ? `Click & Win!` : `Start a New Game`,
            ),
          ),

          // Brand logo
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                bottom: "30px",
              },
            },
            React.createElement("img", {
              src: `${baseUrl}/firebid-celo.svg`,
              width: 45,
              height: 45,
              style: { marginRight: "8px" },
              alt: "FireBid Logo",
            }),
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "36px",
                  fontWeight: "700",
                  color: "#fcff52",
                  marginTop: "6px",
                  fontFamily: "RubikBold",
                },
              },
              "FireBid Celo",
            ),
          ),

          // Tagline
          React.createElement(
            "div",
            {
              style: {
                fontSize: "20px",
                fontWeight: "400",
                color: "#AAAAAA",
                textTransform: "uppercase",
                letterSpacing: "5px",
                position: "absolute",
                bottom: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
            },
            "OUTBURN · OUTLAST · OUTBID",
          ),
        ),
      ),
      {
        width: 1200,
        height: 800,
        fonts: [
          {
            name: "RubikBlack",
            data: await loadGoogleFont("Rubik:wght@800"),
            style: "normal",
          },
          {
            name: "Rubik",
            data: await loadGoogleFont("Rubik:wght@400"),
            style: "normal",
          },
          {
            name: "RubikBold",
            data: await loadGoogleFont("Rubik:wght@700"),
            style: "normal",
          },
          {
            name: "RubikLight",
            data: await loadGoogleFont("Rubik:wght@300"),
            style: "normal",
          },
          {
            name: "NotoSansBold",
            data: await loadGoogleFont("Noto+Sans+Mono:wght@700"),
            style: "normal",
          },
        ],
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );

    return imageResponse;
  } catch (error) {
    console.error("Error generating OG image:", error);

    // Fallback to a simple error image
    return new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: "1200px",
            height: "800px",
            background: "#141D2A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "48px",
            color: "#6b7280",
          },
        },
        "Error generating image",
      ),
      {
        width: 1200,
        height: 800,
      },
    );
  }
}
