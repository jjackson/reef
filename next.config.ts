import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', '@1password/sdk'],
};

export default nextConfig;
