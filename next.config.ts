import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb", // upload de PDFs pelo formulário
    },
  },
  serverExternalPackages: ["firebase-admin", "pdf-parse"],
};

export default nextConfig;
