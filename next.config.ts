import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', '@1password/sdk', 'ws'],
  devIndicators: false,
};

export default nextConfig;
