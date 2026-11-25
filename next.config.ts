import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the project root (a stray lockfile in the home folder confuses root detection).
    root: __dirname,
    // Tailwind CSS v4 runs as a Turbopack loader (from create-next-app 16.4).
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // @react-pdf/renderer ships its own font/layout engines; keep it out of the server bundle.
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF fallback font for the ₹ glyph (read from disk by src/server/pdf.tsx, D-018).
  outputFileTracingIncludes: {
    "/api/invoices/*/pdf": ["./src/server/fonts/**/*"],
    "/api/documents/*/pdf": ["./src/server/fonts/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // uploads are capped at 4 MB in src/lib/storage.ts
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
