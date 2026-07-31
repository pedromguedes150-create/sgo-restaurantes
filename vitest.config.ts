import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Os testes de integração compartilham UM banco (o mesmo DATABASE_URL). Rodar
    // arquivos em paralelo causava conflito/deadlock e travava o CI. Serial resolve.
    fileParallelism: false,
    // Operações de banco no beforeAll/testes podem passar dos 5s padrão do Vitest.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
