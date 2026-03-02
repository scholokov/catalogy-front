import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Catalogy",
    short_name: "Catalogy",
    description: "Catalogy",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f1c",
    theme_color: "#7C3AED",
    icons: [
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/images/icon_192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/images/icon_512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
