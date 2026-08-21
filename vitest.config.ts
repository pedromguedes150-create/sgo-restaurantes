import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  /* JSX automático, como o Next compila. Sem isto o componente vira
     React.createElement sem React no escopo e o teste falha por motivo errado. */
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    /* .tsx entra para permitir teste de RENDER de componente — foi assim que
       reproduzi, sem sessão, a tela que quebrava só em produção. */
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Os testes de integração compartilham UM banco (o mesmo DATABASE_URL). Rodar
    // arquivos em paralelo causava conflito/deadlock e travava o CI. Serial resolve.
    fileParallelism: false,
    // Operações de banco no beforeAll/testes podem passar dos 5s padrão do Vitest.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
