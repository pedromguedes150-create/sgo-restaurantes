/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // imagem Docker enxuta (Fase 0)
  poweredByHeader: false,
  experimental: {
    // uploads e libs nativas ficam fora do bundle do servidor
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'web-push'],
    // scheduler interno (src/instrumentation.ts): manutenção de tarefas
    instrumentationHook: true,
  },
};

export default nextConfig;
