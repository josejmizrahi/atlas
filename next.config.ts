import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Evidencia manual: correos exportados y PDFs medianos
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
