import { describe, it, expect } from 'vitest';
import { parseCommandBarcode, candidateNumbers, absentFromScans } from '@/lib/commands/barcode';

/** Sequência ativa de exemplo: comandas 1..600. */
const active = new Set<number>();
for (let n = 1; n <= 600; n++) active.add(n);

describe('parseCommandBarcode — leitura tolerante do código da comanda', () => {
  it('aceita o número puro', () => {
    expect(parseCommandBarcode('137', active)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('aceita com zeros à esquerda (etiqueta "0000000137")', () => {
    expect(parseCommandBarcode('0000000137', active)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('ignora espaços e quebra de linha que o leitor manda junto', () => {
    expect(parseCommandBarcode('  0137 \r\n', active)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('aceita código com prefixo de unidade (letras ou dígitos extras)', () => {
    expect(parseCommandBarcode('CMD-0137', active)).toMatchObject({ number: 137, reason: 'OK' });
    expect(parseCommandBarcode('99000137', active)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('aceita EAN-13 descartando o dígito verificador quando o miolo é a comanda', () => {
    // 12 dígitos + verificador; o número da comanda está no início do bloco
    const ean = '0000001370005';
    expect(parseCommandBarcode(ean, active).number).not.toBeNull();
  });

  it('recusa número fora da sequência ativa, mas devolve o palpite p/ a tela avisar', () => {
    const r = parseCommandBarcode('9999', active);
    expect(r.number).toBeNull();
    expect(r.reason).toBe('NOT_ACTIVE');
    expect(r.guess).toBe(9999);
  });

  it('recusa leitura vazia ou sem dígitos', () => {
    expect(parseCommandBarcode('', active).reason).toBe('EMPTY');
    expect(parseCommandBarcode('   ', active).reason).toBe('EMPTY');
    expect(parseCommandBarcode('ABC', active).reason).toBe('NO_DIGITS');
  });

  it('nunca inventa comanda: só aceita palpite que existe na sequência', () => {
    const pequena = new Set([10, 20, 30]);
    expect(parseCommandBarcode('123456', pequena).number).toBeNull();
    expect(parseCommandBarcode('000020', pequena).number).toBe(20);
  });

  /* A etiqueta real da rede (foto de 19/08/2026): cartão plástico com código de
     barras e "0346" impresso embaixo. A sequência da KM13 vai além de 600. */
  it('lê a etiqueta da rede no formato impresso "0346"', () => {
    expect(parseCommandBarcode('0346', active)).toMatchObject({ number: 346, reason: 'OK' });
  });

  it('lê comanda de três dígitos numa sequência que passa de 600', () => {
    const km13 = new Set<number>();
    for (let n = 1; n <= 605; n++) km13.add(n);
    expect(parseCommandBarcode('0605', km13)).toMatchObject({ number: 605, reason: 'OK' });
    expect(parseCommandBarcode('0451', km13)).toMatchObject({ number: 451, reason: 'OK' });
  });

  /* POR QUE A CALIBRAÇÃO IMPORTA (e não é preciosismo):
     o parser tolerante testa janelas de dígitos e aceita a PRIMEIRA que exista na
     sequência. Se o código real trouxer dígitos extras, uma janela pode casar com
     uma comanda válida ERRADA — e a conferência daria "presente" para a comanda
     que não está na mesa. Este teste registra o risco; ele desaparece quando
     soubermos o formato exato e o parser puder ser exato também. */
  it('DOCUMENTA a ambiguidade: dígitos extras podem casar com outra comanda válida', () => {
    const r = parseCommandBarcode('1346', active); // 1346 não existe; a janela final "346" existe
    expect(r.number).toBe(346);
    expect(r.raw).toBe('1346');
  });

  it('candidateNumbers não devolve duplicados nem zero', () => {
    const c = candidateNumbers('0000');
    expect(c).not.toContain(0);
    expect(new Set(c).size).toBe(c.length);
  });
});

describe('absentFromScans — faltantes da conferência', () => {
  it('faltantes = ativas − bipadas, em ordem', () => {
    expect(absentFromScans(new Set([1, 2, 3, 4]), new Set([2, 4]))).toEqual([1, 3]);
  });

  it('tudo bipado = nenhuma faltante', () => {
    expect(absentFromScans(new Set([1, 2]), new Set([1, 2]))).toEqual([]);
  });

  it('bipagem de comanda fora da sequência não some com faltante alguma', () => {
    expect(absentFromScans(new Set([1, 2]), new Set([2, 999]))).toEqual([1]);
  });
});
