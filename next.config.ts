import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false, // não anuncia a tecnologia (X-Powered-By: Next.js)
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb", // upload de PDFs pelo formulário
    },
  },
  serverExternalPackages: ["firebase-admin", "pdf-parse"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
