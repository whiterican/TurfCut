import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Chat attachments go through a server action: 4 MB files (lib/chat.ts
    // MAX_ATTACHMENT_BYTES) plus form overhead. Kept under common hosting
    // request limits.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
