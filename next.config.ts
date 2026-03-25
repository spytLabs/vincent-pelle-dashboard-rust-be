import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export', // Uncommented to allow static export for Tauri
  images: {
    unoptimized: true,
  },
};

export default nextConfig;