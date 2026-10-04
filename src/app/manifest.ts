import type { MetadataRoute } from "next";

/** Home-screen install: the mint pin-check-nib mark on forest green; green-black splash (the app opens dark by default). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turfcut",
    short_name: "Turfcut",
    description: "The marketplace for political field work.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0f1612",
    theme_color: "#205a42",
    icons: [
      { src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // A copy with the glyph scaled into the maskable safe zone (radius 0.4 of the width),
      // so Android can crop it to any shape without clipping the pen tip.
      { src: "/brand/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
