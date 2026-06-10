/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // imagem Docker enxuta (Fase 0)
  poweredByHeader: false,
  experimental: {
    // uploads e libs nativas ficam fora do bundle do servidor
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
};

export default nextConfig;
