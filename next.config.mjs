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
  webpack: (config, { nextRuntime }) => {
    // O scheduler (src/instrumentation.ts) importa a Central de Notificações, que
    // agora carrega o Web Push. O Next compila a instrumentação TAMBÉM para o
    // runtime edge, onde 'web-push' (http/https/crypto do Node) não resolve e
    // derrubava o servidor inteiro. Em edge o register() já sai na 1ª linha
    // (NEXT_RUNTIME !== 'nodejs'), então basta não tentar empacotar a lib ali.
    if (nextRuntime === 'edge') {
      config.externals = [...(config.externals ?? []), 'web-push'];
    }
    return config;
  },
};

export default nextConfig;
