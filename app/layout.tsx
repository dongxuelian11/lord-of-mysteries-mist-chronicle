import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./complete-game.css";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-v2.png`;

  return {
    title: "灰雾纪事｜诡秘之主同人推演",
    description: "经营你的非凡者组织，在原著时间线中调查、抉择并改写历史。",
    icons: {
      icon: "/og-v2.png",
      shortcut: "/og-v2.png",
    },
    openGraph: {
      title: "灰雾纪事",
      description: "在原著时间线中，经营组织，调查异常，改写历史。",
      images: [{ url: imageUrl, width: 1674, height: 941, alt: "灰雾纪事游戏封面" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "灰雾纪事",
      description: "在原著时间线中，经营组织，调查异常，改写历史。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
