/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  images: {
    domains: ["localhost"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ],
    unoptimized: true
  },
  webpack: (config) => {
    // Handle node modules that need special treatment
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false
    };

    return config;
  }
};

export default nextConfig;
