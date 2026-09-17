import { describe, it, expect } from 'vitest';
import { MODULES } from '@/lib/permissions';
import { AREAS, FORA_DO_MENU, KEYS_NO_MENU } from '@/lib/nav/areas';

/**
 * O menu e a matriz de permissões não podem divergir.
 *
 * Antes deste catálogo havia QUATRO listas de módulos escritas à mão — a
 * sidebar, as famílias, o hub do celular e a matriz — e elas divergiam em
 * silêncio: módulo novo entrava na matriz e simplesmente não aparecia em
 * lugar nenhum do menu. Ninguém errava; o sistema é que não cobrava.
 *
 * Estes casos cobram, nas DUAS direções, porque as duas já aconteceram.
 */

const comEndereco = MODULES.filter((m) => m.nav);
const chavesDaMatriz = new Set(MODULES.map((m) => m.key));

describe('o menu cobre a matriz', () => {
  it('todo módulo com endereço está numa área OU tem exceção escrita', () => {
    const orfaos = comEndereco
      .filter((m) => !KEYS_NO_MENU.has(m.key) && !(m.key in FORA_DO_MENU))
      .map((m) => `${m.key} (${m.nav})`);

    expect(orfaos, `módulo(s) sem lugar no menu — categorize em src/lib/nav/areas.ts ou justifique em FORA_DO_MENU:\n  ${orfaos.join('\n  ')}`).toEqual([]);
  });

  it('a exceção aponta para um módulo que existe e traz o motivo', () => {
    for (const [key, motivo] of Object.entries(FORA_DO_MENU)) {
      expect(chavesDaMatriz.has(key), `FORA_DO_MENU cita ${key}, que não está na matriz`).toBe(true);
      expect(motivo.length, `a exceção de ${key} precisa dizer por quê`).toBeGreaterThan(10);
    }
  });
});

describe('a matriz cobre o menu', () => {
  it('toda chave do menu existe na matriz e tem endereço', () => {
    /* O caminho inverso: renomear uma chave na matriz deixaria o menu apontando
       para o vazio — a coluna sumiria sem aviso, que é exatamente o defeito
       que este catálogo veio resolver. */
    const porKey = new Map(MODULES.map((m) => [m.key, m]));
    const quebradas: string[] = [];
    for (const key of KEYS_NO_MENU) {
      const m = porKey.get(key);
      if (!m) quebradas.push(`${key}: não existe na matriz`);
      else if (!m.nav) quebradas.push(`${key}: existe, mas não tem endereço (é aba/submenu)`);
    }
    expect(quebradas, `chave(s) do menu sem destino:\n  ${quebradas.join('\n  ')}`).toEqual([]);
  });

  it('nenhum módulo aparece em duas colunas', () => {
    /* Item repetido faz a busca devolver o mesmo destino duas vezes e o
       favorito piscar em dois lugares. */
    const todas = AREAS.flatMap((a) => a.colunas.flatMap((c) => c.keys));
    const vistos = new Set<string>();
    const repetidos = todas.filter((k) => (vistos.has(k) ? true : (vistos.add(k), false)));
    expect(repetidos).toEqual([]);
  });
});

describe('a forma do menu', () => {
  it('nenhuma área nasce vazia e nenhuma coluna nasce sem itens', () => {
    for (const a of AREAS) {
      expect(a.colunas.length, `área ${a.id} sem colunas`).toBeGreaterThan(0);
      for (const c of a.colunas) {
        expect(c.keys.length, `coluna "${c.titulo}" de ${a.id} sem chaves`).toBeGreaterThan(0);
      }
    }
  });

  it('os ids das áreas são únicos', () => {
    const ids = AREAS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
