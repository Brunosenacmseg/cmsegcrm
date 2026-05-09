/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint segue ignorado durante build até passarmos no projeto.
  // TypeScript: 0 erros — build estrito ativado.
  eslint: { ignoreDuringBuilds: true },
}
module.exports = nextConfig
