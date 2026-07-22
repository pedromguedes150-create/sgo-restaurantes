/**
 * Gera um par de chaves VAPID para o Web Push.
 * Rode NO SERVIDOR de produção e cole a saída no .env (a privada nunca sai dali):
 *   node scripts/gen-vapid.mjs
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:ti@grupobeijaflor.com.br');
console.log('\n⚠️  Trocar as chaves invalida as inscrições já feitas — os usuários precisam ativar de novo.');
