import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No floating Next.js badge while developing (it never ships to users).
  devIndicators: false,
  // Pay moved from /payouts to /pay (C1.4); old links and bookmarks still work.
  async redirects() {
    return [
      { source: "/payouts", destination: "/pay", permanent: false },
      { source: "/payouts/export", destination: "/pay/export", permanent: false },
    ];
  },
  async headers() {
    return [
      // Every response. Nothing may show the app inside a frame (a login page
      // in a hidden frame is how clickjacking works), files are taken for the
      // type they're sent as, and only the app itself may ask for the
      // phone's location (check-in, the turf map); no camera or microphone.
      // The referrer policy stays the browser default
      // (strict-origin-when-cross-origin); routes that need stricter set it.
      // These four keys win over a route handler's own value: a route that
      // needs a different one gets a later, more specific rule here, as
      // /sw.js does.
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      // A credential photo (C3.6b) is an image and nothing else: no scripts,
      // no frames, no fetches, and never cached.
      {
        source: "/api/credential-proofs/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; frame-ancestors 'none'; sandbox" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      // The offline brief's service worker must never be served stale. Listed
      // after the rule above so its own policy wins (the last match does).
      // As the Next.js PWA guide sets them for a service worker.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    // Chat attachments go through a server action: 4 MB files (lib/chat.ts
    // MAX_ATTACHMENT_BYTES) plus form overhead. Kept under common hosting
    // request limits.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
