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
  // The offline brief's service worker must never be served stale.
  async headers() {
    // As the Next.js PWA guide sets them for a service worker.
    return [
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
