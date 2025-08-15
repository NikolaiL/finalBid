import type { Metadata } from "next";

const baseUrl = process.env.NEXT_PUBLIC_URL ?? `http://localhost:${process.env.NEXT_PUBLIC_PORT || 3000}`;
const titleTemplate = "%s | Scaffold-ETH 2";

export const getMetadata = ({
  title,
  description,
  imageRelativePath = "/embedImage.png",
}: {
  title: string;
  description: string;
  imageRelativePath?: string;
}): Metadata => {
  const imageUrl = `${baseUrl}${imageRelativePath}`;
  const miniAppContent = JSON.stringify({
    version: "1",
    imageUrl: process.env.NEXT_PUBLIC_IMAGE_URL ?? imageUrl,
    button: {
      title: `${process.env.NEXT_PUBLIC_APP_NAME ?? title}`,
      action: {
        url: `${baseUrl}/`,
        type: "launch_miniapp",
      },
    },
  });

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: title,
      template: titleTemplate,
    },
    description: description,
    // Global font preload via Google (Rubik). This inserts a link header.
    // Next.js Metadata API supports experimental fonts via next/font, but for OG and SSR
    // we keep a simple webfont link to ensure consistency.
    other: {
      "fc:miniapp": miniAppContent,
      "fc:frame": miniAppContent,
      "link:preconnect": "https://fonts.googleapis.com",
      "link:preconnect-cross": "https://fonts.gstatic.com",
      "link:stylesheet-rubik": "https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;700;800&display=swap",
    },
    manifest: "/manifest.json",
    // keep fc:miniapp/fc:frame also in other (duplicated above for compatibility)
    openGraph: {
      title: {
        default: title,
        template: titleTemplate,
      },
      description: description,
      images: [
        {
          url: imageUrl,
        },
      ],
    },
    twitter: {
      title: {
        default: title,
        template: titleTemplate,
      },
      description: description,
      images: [imageUrl],
    },
    icons: {
      icon: [
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
        { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
        { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
};
