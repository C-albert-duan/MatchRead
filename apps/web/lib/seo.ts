import type { Metadata } from "next";
import { publicSiteUrl } from "@/lib/site-url";

const DEFAULT_DESCRIPTION =
  "Tennis bracket leagues for groups. Fill brackets together. Come back for the Daily Check.";

export function publicPageMetadata(input: {
  title: string;
  description?: string;
  path: string;
}): Metadata {
  const site = publicSiteUrl();
  const url = `${site}${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
  const title = input.title;
  const description = input.description ?? DEFAULT_DESCRIPTION;
  const image = `${site}/atmosphere/court-hard.webp`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "MatchRead",
      type: "website",
      images: [{ url: image, alt: "MatchRead" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
