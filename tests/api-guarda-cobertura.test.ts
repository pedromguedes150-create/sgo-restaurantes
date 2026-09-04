import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REGRAS, FORA_DA_MATRIZ, regraDaRota } from '@/lib/permissions/guarda-rota-api';
import { MODULES } from '@/lib/permissions';

/**
 * Cobertura das rotas de API: cada uma tem dono na matriz, ou uma razão escrita
 * para ficar de fora.
 *
 * Medido antes desta versão: **1 de 105 rotas** checava a matriz de perfis.
 * "Editar" desmarcado tirava o botão da tela e a requisição continuava valendo.
 * Este teste é o que impede voltar a esse estado — rota nova sem decisão quebra
 * aqui, e não em produção.
 */

const RAIZ = path.join(process.cwd(), 'src/app/api');

function rotasDeApi(dir: string, prefixo = '/api'): { rota: string; arquivo: string }[] {
  const out: { rota: string; arquivo: string }[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...rotasDeApi(p, `${prefixo}/${e.name}`));
    else if (e.name === 'route.ts') out.push({ rota: prefixo, arquivo: p });
  }
  return out;
}

const ROTAS = rotasDeApi(RAIZ);
const ESCREVE = /export async function (POST|PUT|PATCH|DELETE)/;
/** Guardas aceitas: a genérica desta versão e as por aba, da v1.64/1.66. */
const TEM_GUARDA = /guardaDaRota|recusaSeAbaFechada|recusaDeAba|canEditModule/;

describe('O mapa cobre o sistema', () => {
  it('achou as rotas no disco', () => {
    expect(ROTAS.length).toBeGreaterThan(100);
  });

  it('toda rota está no mapa ou tem razão escrita para ficar fora', () => {
    const orfas = ROTAS
      .map((r) => r.rota)
      .filter((r) => !(r in REGRAS) && !(r in FORA_DA_MATRIZ) && !regraDaRota(r));
    expect(orfas, `sem decisão: ${orfas.join(', ')}`).toEqual([]);
  });

  it('nenhuma rota está nos dois lugares ao mesmo tempo', () => {
    const nos2 = Object.keys(REGRAS).filter((r) => r in FORA_DA_MATRIZ);
    expect(nos2).toEqual([]);
  });

  it('todo módulo citado no mapa existe na matriz', () => {
    const chaves = new Set(MODULES.map((m) => m.key));
    for (const [rota, regra] of Object.entries(REGRAS)) {
      expect(chaves.has(regra.modulo), `${rota} aponta para ${regra.modulo}, que não existe`).toBe(true);
    }
  });

  it('a razão de ficar de fora nunca é vazia', () => {
    for (const [rota, motivo] of Object.entries(FORA_DA_MATRIZ)) {
      expect(motivo.length, `${rota} sem motivo`).toBeGreaterThan(10);
    }
  });
});

describe('Rota mapeada tem a guarda escrita no arquivo', () => {
  it('nenhuma rota do mapa ficou sem chamar a guarda', () => {
    const semGuarda = ROTAS
      .filter((r) => r.rota in REGRAS)
      .filter((r) => !TEM_GUARDA.test(fs.readFileSync(r.arquivo, 'utf8')))
      .map((r) => r.rota);
    expect(semGuarda, `mapeadas sem guarda: ${semGuarda.join(', ')}`).toEqual([]);
  });

  it('toda rota que GRAVA está coberta — pelo mapa ou por guarda de aba', () => {
    const desprotegidas = ROTAS
      .filter((r) => ESCREVE.test(fs.readFileSync(r.arquivo, 'utf8')))
      .filter((r) => !(r.rota in FORA_DA_MATRIZ))
      .filter((r) => !TEM_GUARDA.test(fs.readFileSync(r.arquivo, 'utf8')))
      .map((r) => r.rota);
    expect(desprotegidas, `gravam sem guarda: ${desprotegidas.join(', ')}`).toEqual([]);
  });
});

describe('O caminho resolve para a regra mais específica', () => {
  it('a exportação não cai na regra da rota principal', () => {
    /* `/api/notes` exige EDITAR; `/api/notes/export` exige só VER — se o
       prefixo curto vencesse, quem tem leitura perderia o relatório. */
    expect(regraDaRota('/api/notes')?.exigir).toBe('editar');
    expect(regraDaRota('/api/notes/export')?.exigir).toBe('ver');
    expect(regraDaRota('/api/notes/export')?.modulo).toBe('NOTES');
  });

  it('rota sem regra devolve nulo (e por isso não é barrada)', () => {
    expect(regraDaRota('/api/health')).toBeNull();
    expect(regraDaRota('/api/auth/login')).toBeNull();
  });

  it('a rota pública da higiene não entrou na matriz', () => {
    /* O QR do banheiro é lido por cliente, sem login: exigir permissão ali
       quebraria a coleta inteira. */
    expect(regraDaRota('/api/higiene')).toBeNull();
    expect(regraDaRota('/api/higiene/manage')?.modulo).toBe('HYGIENE');
  });
});
