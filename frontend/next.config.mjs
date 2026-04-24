/**
 * Backend URL is resolved at request time on the server. Set BACKEND_URL on
 * Vercel (or any host) to the public URL of the FastAPI backend. Falls back
 * to localhost for local dev.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
