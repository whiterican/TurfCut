import type { MetadataRoute } from "next";

/** Home-screen install: the gold pin-check-nib mark on eggplant, eggplant splash (the app opens dark by default). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turfcut",
    short_name: "Turfcut",
    description: "The marketplace for political field work.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#281840",
    theme_color: "#281840",
    icons: [
      { src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // The glyph sits inside the maskable safe zone, so Android can crop it to any shape.
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
