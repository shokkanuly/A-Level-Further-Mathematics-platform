import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
  // На машине есть посторонние lockfile выше по дереву — фиксируем корень явно.
  outputFileTracingRoot: import.meta.dirname ?? __dirname,
};

export default nextConfig;

