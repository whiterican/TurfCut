import type { MetadataRoute } from "next";

/** Home-screen install: the brand icon on eggplant, cream splash. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turfcut",
    short_name: "Turfcut",
    description: "The marketplace for political field work.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f4f2e4",
    theme_color: "#281840",
    icons: [
      { src: "/brand/icons/turfcut-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icons/turfcut-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
