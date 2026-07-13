import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['192.168.1.81','127.0.0.1'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
