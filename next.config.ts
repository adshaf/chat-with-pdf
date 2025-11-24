import type { NextConfig } from "next";

const nextConfig: NextConfig = {
// webpack: (config) => {
//   config.resolve.alias.canvas = false;

//   return config;
// },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
      },
    ],
  },
};

export default nextConfig;
