import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', '@1password/sdk'],
  devIndicators: false,
};

export default nextConfig;
