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
    ],
  };
}
