import React from "react";
import { NextRequest } from "next/server";
import { sql } from "@ponder/client";
import { ImageResponse } from "@vercel/og";
import { blo } from "blo";
// Use lightweight Ponder client to avoid importing ponder schema/graph server
import { client } from "~~/lib/ponderLight";
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
          background: "#F4F8FF",
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
            background: "#ffffff",
            borderRadius: "75px",
            border: "3px solid #DAE8FF",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
            boxShadow: "0 20px 20px #DAE8FF",
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
          "No Active Auction",
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
          "Check back later for new auctions!",
        ),
      ),
    ),
    {
      width: 1200,
      height: 800,
    },
  );
}

export async function GET(req: NextRequest) {
  try {
    // Declare variables outside try block so they're accessible in the image generation
    let auctionAmountFormatted = "100.00";
    let timeRemainingFormatted = "300";
    let nextBidFormatted = "1.00";
    let auction: any = null;
    let tokenMeta: { tokenAddress: `0x${string}`; symbol: string; decimals: number } | null = null;
    let isActive = false;
    let isWinner = false;
    let winnerData: any = null;

    // Base URL for absolute asset paths in OG generation
    const baseUrl = (process.env.NEXT_PUBLIC_URL ?? new URL(req.url).origin).replace(/\/$/, "");

    tokenMeta = await readTokenMeta();

    const tokenSymbol = tokenMeta?.symbol ?? "USDC";
    const tokenDecimals = tokenMeta?.decimals ?? 6;

    // Fetch current auction data from Ponder API

    try {
      // Use the Ponder client with SQL operator for type-safe queries

      const response = await client.db.execute(sql`
          SELECT * FROM "auctionCreated"
          ORDER BY timestamp DESC 
          LIMIT 1
        `);

      if (!response || response.length === 0) {
        console.error("No auction data found in Ponder");
        return generateDefaultImage();
      }

      const currentAuction = response[0];

      if (!currentAuction) {
        // No auction found, return default image
        return generateDefaultImage();
      }

      // Validate that we have some data
      if (!Array.isArray(currentAuction) || currentAuction.length === 0) {
        console.error("Invalid auction data structure:", currentAuction);
        return generateDefaultImage();
      }

      // Map the array values to an object with property names
      // Since we might get different column orders, let's be flexible
      auction = {
        auctionId: currentAuction[0] || "0",
        hash: currentAuction[1] || "",
        auctionAmount: currentAuction[2] || "0",
        startTime: currentAuction[3] || "0",
        endTime: currentAuction[4] || "0",
        startingAmount: currentAuction[5] || "0",
        bidIncrement: currentAuction[6] || "0",
        referralFee: currentAuction[7] || "0",
        platformFee: currentAuction[8] || "0",
        bidCount: currentAuction[9] || 0,
        highestBid: currentAuction[10] || "0",
        highestBidder: currentAuction[11] || "",
        blockNumber: currentAuction[12] || "0",
        logIndex: currentAuction[13] || 0,
        timestamp: currentAuction[14] || "0",
        ended: currentAuction[15] || false,
      };

      // Check if auction is still active
      const now = Math.floor(Date.now() / 1000);
      isActive =
        !auction.ended && Number(auction.endTime) > now && Number(auction.highestBid) < Number(auction.auctionAmount);
      //isActive = false;
      isWinner = auction.highestBidder && auction.highestBidder !== "0x0000000000000000000000000000000000000000";
      //isWinner = false;

      if (isWinner) {
        const winnerDataResponse = await fetch(`${baseUrl}/api/farcaster-user?address=${auction.highestBidder}`);
        const winnerDataTemp = await winnerDataResponse.json();
        if (winnerDataTemp.user) {
          winnerData = {
            username: winnerDataTemp.user.username,
            profilePicture: winnerDataTemp.user.pfp_url,
          };
        } else {
          winnerData = {
            username: auction.highestBidder?.slice(0, 6) + "…" + auction.highestBidder?.slice(-4),
            profilePicture: blo(auction.highestBidder as `0x${string}`), // generate an image from address
          };
        }
      }

      // Calculate time remaining
      const timeRemaining = Math.max(0, Number(auction.endTime) - now);
      timeRemainingFormatted = formatTimeRemaining(timeRemaining);

      // Safely format token amounts with fallbacks
      try {
        auctionAmountFormatted = formatToken(BigInt(auction.auctionAmount || "0"), tokenDecimals);
        nextBidFormatted = formatToken(
          BigInt(
            BigInt(auction.highestBid) > 0
              ? BigInt(auction.highestBid) + BigInt(auction.bidIncrement)
              : BigInt(auction.startingAmount),
          ),
          tokenDecimals,
        );
      } catch (formatError) {
        console.error("Error formatting USDC amounts:", formatError);
        // Use fallback values
        auctionAmountFormatted = "100.00";
        nextBidFormatted = "1.00";
      }

      // Validate auction data
      if (!auction.auctionAmount || !auction.endTime) {
        console.error("Invalid auction data:", auction);
        return generateDefaultImage();
      }
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
            background: "#F4F8FF",
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
              background: "#ffffff",
              borderRadius: "75px",
              border: "3px solid #DAE8FF",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
              boxShadow: "0 20px 20px #DAE8FF",
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
                  color: "#000000",
                  marginRight: "8px",
                  fontFamily: "RubikLight",
                },
              },
              "Win",
            ),
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "100px",
                  fontFamily: "RubikBlack",
                  color: "#ff6600",
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
                  color: "#000000",
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
                    top: "130px",
                  },
                },
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "24px",
                      fontWeight: "400",
                      color: "#00000080",
                      marginRight: "8px",
                    },
                  },
                  "Auction ends in",
                ),
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "36px",
                      fontWeight: "800",
                      fontFamily: "RubikBlack",
                      color: "#00000080",
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
                      color: "#00000080",
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
                    style: { marginRight: "8px", borderRadius: "50%" },
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
                        color: "#666666",
                        fontFamily: "Rubik",
                        marginRight: "8px",
                      },
                    },
                    `Current top bidder is`,
                  ),
                  React.createElement("img", {
                    src: winnerData.profilePicture,
                    width: 32,
                    height: 32,
                    style: { borderRadius: "50%" },
                    alt: "Current Top Bidder Profile Picture",
                  }),
                  React.createElement(
                    "span",
                    { style: { fontSize: "24px", fontWeight: "700", color: "#666666", fontFamily: "RubikBold" } },
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
                background: "#ff6600",
                borderRadius: "50px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                bottom: "120px",
                boxShadow: "0 8px 24px rgba(255, 107, 53, 0.3)",
              },
            },
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "40px",
                  fontWeight: "700",
                  color: "#ffffff",
                  fontFamily: "RubikBold",
                },
              },
              isActive ? `Bid ${nextBidFormatted} ${tokenSymbol}` : `Start a New Auction`,
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
              src: `${baseUrl}/fireBidOrange.svg`,
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
                  color: "#ff6600",
                  marginTop: "6px",
                  fontFamily: "RubikBold",
                },
              },
              "FireBid",
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
            background: "#f3f4f6",
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
