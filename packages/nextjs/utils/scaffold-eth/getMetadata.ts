import type { Metadata } from "next";

const baseUrl = process.env.NEXT_PUBLIC_URL ?? `http://localhost:${process.env.NEXT_PUBLIC_PORT || 3000}`;
const titleTemplate = "%s | Scaffold-ETH 2";

export const getMetadata = ({
  title,
  description,
  imageRelativePath = "/embed.png",
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
    manifest: "/manifest.json",
    other: {
      "fc:miniapp": miniAppContent,
      "fc:frame": miniAppContent,
    },
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
        { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
        { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
};
