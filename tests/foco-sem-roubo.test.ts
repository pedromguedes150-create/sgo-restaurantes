import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * NENHUM CAMPO ROUBA O FOCO DA TELA (v1.210.0).
 *
 * 🔴 A mesma classe de defeito apareceu quatro vezes em Comandas (v1.109.1,
 * v1.192.0, v1.193.1 e o vídeo da Nova União de 16/11): o campo do leitor
 * recapturava o foco sem condição e a tela "voltava para a bipagem" — a
 * justificativa não aceitava texto, o cancelar não confirmava, o toque na grade
 * pulava para o topo e, por último, o "Concluir conferência" da tela antiga do
 * leitor não gravava. As três primeiras correções foram feitas numa tela só.
 *
 * Por isso este teste não olha uma tela: varre TODO componente de `src`.
 * Lê o código (e não monta a tela) porque `jsdom` não reproduz disputa de foco
 * nem rolagem.
 */

const raiz = join(process.cwd(), 'src');
const arquivos: string[] = [];
(function andar(dir: string) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) andar(p);
    else if (p.endsWith('.tsx')) arquivos.push(p);
  }
})(raiz);

/** Cada bloco `onBlur={…}` do arquivo, com as chaves balanceadas. */
function blocosDeBlur(fonte: string): string[] {
  const blocos: string[] = [];
  let de = 0;
  for (;;) {
    const ini = fonte.indexOf('onBlur={', de);
    if (ini < 0) break;
    let i = ini + 'onBlur='.length;
    let nivel = 0;
    do {
      if (fonte[i] === '{') nivel += 1;
      if (fonte[i] === '}') nivel -= 1;
      i += 1;
    } while (nivel > 0 && i < fonte.length);
    blocos.push(fonte.slice(ini, i));
    de = i;
  }
  return blocos;
}

describe('Em todo o sistema: perder o foco nunca o puxa de volta sem condição', () => {
  it('a varredura enxerga os componentes', () => {
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it('todo `onBlur` que refoca só o faz quando o foco se PERDEU (relatedTarget) e sem rolar a página', () => {
    const culpados: string[] = [];
    for (const arq of arquivos) {
      const fonte = readFileSync(arq, 'utf8');
      for (const blur of blocosDeBlur(fonte)) {
        /* Refoca = chama `.focus(` ou uma função de foco conhecida dentro do onBlur. */
        if (!/\.focus\(|keepFocus|focarLeitor/.test(blur)) continue;
        const condicional = blur.includes('relatedTarget');
        /* O foco em si pode morar numa função do arquivo: ela precisa ser sem rolagem. */
        const semRolagem = blur.includes('preventScroll') || /focus\(\{ preventScroll: true \}\)/.test(fonte);
        if (!condicional || !semRolagem) culpados.push(relative(process.cwd(), arq));
      }
    }
    expect(culpados).toEqual([]);
  });

  it('nenhum invólucro refoca um campo a cada clique (`onClick={keepFocus}`)', () => {
    const culpados = arquivos.filter((arq) => /onClick=\{keepFocus\}/.test(readFileSync(arq, 'utf8'))).map((a) => relative(process.cwd(), a));
    expect(culpados).toEqual([]);
  });
});

describe.each([
  ['a conferência por sessão', 'src/components/commands/sessao-client.tsx'],
  ['a conferência por leitor (tela antiga)', 'src/components/commands/scan-client.tsx'],
])('As quatro regras do leitor valem em %s', (_nome, caminho) => {
  const fonte = readFileSync(join(process.cwd(), caminho), 'utf8');
  const campo = fonte.slice(fonte.indexOf('ref={inputRef}'), fonte.indexOf('/>', fonte.indexOf('ref={inputRef}')));

  it('o leitor tem UMA condição de estar ativo, lida por referência', () => {
    expect(fonte).toMatch(/const leitorAtivo = /);
    expect(fonte).toMatch(/leitorAtivoRef\.current\s*=\s*leitorAtivo/);
    expect(campo).toContain('leitorAtivoRef.current');
  });

  it('todo foco no campo do leitor é sem rolagem, e ele não tem autoFocus', () => {
    expect(fonte).toContain('inputRef.current?.focus({ preventScroll: true })');
    expect(fonte).not.toMatch(/inputRef\.current\?\.focus\(\)/);
    expect(campo).not.toContain('autoFocus');
  });

  it('o onBlur só recaptura quando o foco foi para lugar nenhum', () => {
    expect(campo).toContain('if (e.relatedTarget) return;');
    expect(campo).toContain('document.activeElement === document.body');
  });

  it('bipar com o foco fora do campo continua funcionando', () => {
    expect(fonte).toMatch(/addEventListener\('keydown', aoTeclar\)/);
  });
});

describe('A tela antiga do leitor: concluir é uma janela que desliga o leitor', () => {
  const fonte = readFileSync(join(process.cwd(), 'src/components/commands/scan-client.tsx'), 'utf8');

  it('a confirmação aberta, a gravação em curso e o resultado desligam o leitor', () => {
    expect(fonte).toMatch(/const leitorAtivo = !confirming && !busy && !done;/);
  });

  it('a confirmação é uma Sheet (por cima da tela), com o erro ao lado do botão', () => {
    const ini = fonte.indexOf('{confirming && (');
    const bloco = fonte.slice(ini, fonte.indexOf('</Sheet>', ini));
    expect(bloco).toContain('<Sheet');
    expect(bloco).toContain('data-testid="confirmar-concluir"');
    expect(bloco).toContain('{error &&');
  });

  it('falha de rede ao registrar é dita, não engolida', () => {
    const ini = fonte.indexOf('async function finish()');
    expect(fonte.slice(ini, fonte.indexOf('if (done)', ini))).toContain('} catch {');
  });
});
