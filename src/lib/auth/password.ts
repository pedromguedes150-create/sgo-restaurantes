import bcrypt from 'bcryptjs';
import { env } from '@/lib/env';

/** Hash de senha com bcrypt (≥12 rounds — requisito de segurança). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

/** Verifica senha contra o hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
