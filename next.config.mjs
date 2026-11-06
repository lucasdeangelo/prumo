/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server for the Docker image (deploy/compose.yaml).
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
