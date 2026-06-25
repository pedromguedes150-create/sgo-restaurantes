import { z } from 'zod';

/**
 * Validação centralizada das variáveis de ambiente.
 * Falha cedo (no boot) se algo crítico faltar.
 * Regra nº 6: o modelo da Claude API vem SEMPRE daqui, nunca fixo no código.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET muito curto'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET muito curto'),
  JWT_ACCESS_TTL: z.string().default('8h'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(12).default(12),

  TZ: z.string().default('America/Sao_Paulo'),

  // Opcionais nesta fase
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Em dev/seed dá uma mensagem clara do que falta
  console.error('❌ Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  throw new Error('Configuração de ambiente inválida — verifique o .env');
}

export const env = parsed.data;
