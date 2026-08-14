/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
  // На машине есть посторонние lockfile выше по дереву — фиксируем корень явно.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
