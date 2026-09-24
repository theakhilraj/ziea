import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/utils/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} - ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#F5F0E8",
    theme_color: "#2C3829",
    icons: [
      { src: "/icon.png", sizes: "500x500", type: "image/png" },
      { src: "/apple-icon.png", sizes: "500x500", type: "image/png" },
    ],
  };
}
