/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['recharts'],
  eslint: {
    // ESLint runs separately via `npm run lint`; don't block production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
