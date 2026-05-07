import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/app/index.html",
        destination: "/"
      }
    ];
  }
};

export default nextConfig;
