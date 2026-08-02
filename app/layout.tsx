import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./complete-game.css";
import "./complete-v7.css";
import "./finale-campaign.css";
import "./api-settings.css";
import "./weekly-council.css";
import "./experience-v10.css";
import "./experience-v11.css";
import "./experience-v12.css";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host") ?? "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-v3.png`;

  return {
    title: "灰雾纪事｜诡秘之主同人推演",
    description: "经营你的非凡者组织，在原著时间线中调查、抉择并改写历史。",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "灰雾纪事",
      description: "经营组织，调查异常，亲手推动历史偏转，并在大雾霾终局决定贝克兰德的命运。",
      images: [{ url: imageUrl, width: 1536, height: 864, alt: "灰雾纪事完整推演版封面" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "灰雾纪事",
      description: "经营组织，调查异常，亲手推动历史偏转，并在大雾霾终局决定贝克兰德的命运。",
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
