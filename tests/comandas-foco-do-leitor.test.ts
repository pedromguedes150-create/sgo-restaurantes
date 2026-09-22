import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O LEITOR NÃO PODE ROUBAR O FOCO DO DIÁLOGO.
 *
 * 🔴 O defeito relatado: na conferência de comandas por leitor, ao clicar em
 * "Finalizar conferência" e tentar preencher "O que houve? (obrigatório)", o
 * campo não aceitava texto. O motivo era o `onBlur` do campo do leitor, que
 * recapturava o foco 50ms depois de perdê-lo, **sem exceção** — a justificativa
 * ficava impossível de escrever e, como ela é obrigatória, o botão de finalizar
 * ficava inalcançável. A conferência travava com 84% feito.
 *
 * Este teste lê o CÓDIGO em vez de montar a tela porque o defeito é de foco e
 * de tempo: `jsdom` não reproduz a disputa de foco entre um campo e um diálogo
 * sobreposto, e um teste que "passa" sem reproduzir o defeito dá falsa
 * segurança. O que dá para garantir com honestidade é a FORMA da correção —
 * que a recaptura seja condicional, e que a condição venha de uma referência.
 */

const fonte = readFileSync(join(process.cwd(), 'src/components/commands/sessao-client.tsx'), 'utf8');

/** A LINHA do `onBlur`. Uma regex de bloco não serve: o corpo tem chaves aninhadas. */
const linhaDoBlur = () => fonte.split('\n').find((l) => l.includes('onBlur=')) ?? '';

describe('A recaptura de foco é condicional', () => {
  it('o `onBlur` NÃO refoca incondicionalmente', () => {
    /* A linha do defeito era exatamente esta:
         onBlur={() => setTimeout(() => inputRef.current?.focus(), 50)}
       Sem nenhuma condição, ela vencia qualquer campo que recebesse o foco. */
    expect(fonte).not.toMatch(/onBlur=\{\(\)\s*=>\s*setTimeout\(\(\)\s*=>\s*inputRef\.current\?\.focus\(\),\s*\d+\)\}/);
  });

  it('a recaptura passa por uma condição antes de focar', () => {
    const blur = linhaDoBlur();
    expect(blur).toContain('if (');
    expect(blur).toContain('focus()');
  });
});

describe('A condição sai de uma REFERÊNCIA, não de uma variável', () => {
  it('o timeout lê `leitorAtivoRef.current`', () => {
    /* Com a variável, o valor seria o do instante em que o timeout foi
       AGENDADO. Ao tocar em "Finalizar conferência" o campo perde o foco no
       mesmo momento em que o diálogo abre — e aquele timeout ainda veria
       "ativo", roubando o foco de volta. A referência é lida quando ele
       dispara. */
    expect(fonte).toContain('leitorAtivoRef.current');
    const blur = linhaDoBlur();
    expect(blur).toContain('leitorAtivoRef.current');
  });

  it('a referência é mantida em dia a cada render', () => {
    expect(fonte).toMatch(/leitorAtivoRef\.current\s*=\s*leitorAtivo/);
  });
});

describe('O leitor desliga enquanto o diálogo está aberto', () => {
  it('`fechando` entra na condição de o leitor estar ativo', () => {
    /* É a condição ÚNICA, usada no efeito e no `onBlur`: duas condições
       escritas em lugares diferentes é como uma delas envelhece sozinha. */
    expect(fonte).toMatch(/const leitorAtivo = .*!fechando/);
  });

  it('o efeito de foco também obedece a ela', () => {
    const efeito = fonte.match(/useEffect\(\(\) => \{\s*if \(leitorAtivo\)[^}]*\}[^)]*\)/)?.[0] ?? '';
    expect(efeito).toContain('leitorAtivo');
    expect(efeito).toContain('focus()');
  });
});

describe('A justificativa continua obrigatória', () => {
  it('o campo segue marcado como obrigatório', () => {
    /* A correção é sobre PODER escrever, não sobre deixar de exigir. */
    expect(fonte).toContain('O que houve? (obrigatório)');
  });
});
