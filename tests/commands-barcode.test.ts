import { describe, it, expect } from 'vitest';
import { parseCommandBarcode, candidateNumbers, absentFromScans, isNotACommand } from '@/lib/commands/barcode';

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

  it('aceita código com prefixo em letras (os dígitos são só a comanda)', () => {
    expect(parseCommandBarcode('CMD-0137', active)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('prefixo NUMÉRICO curto não é mais adivinhado (era onde nascia o falso positivo)', () => {
    // 8 dígitos: "99000137" poderia virar 137 por janela. Agora exige padrão longo.
    expect(parseCommandBarcode('99000137', active).number).toBeNull();
  });

  it('recusa código longo que casa com MAIS DE UMA comanda ativa', () => {
    /* Neste EAN de 13 dígitos as janelas chegam a 1, 5 e 13 ao mesmo tempo —
       todas ativas. Antes o parser pegava a primeira e marcava presente uma
       comanda que não estava na mesa. Agora recusa e mostra o código lido. */
    const r = parseCommandBarcode('0000001370005', active);
    expect(r.number).toBeNull();
    expect(r.reason).toBe('NOT_ACTIVE');
  });

  it('aceita código longo quando as janelas apontam para UMA só comanda ativa', () => {
    const so137 = new Set([137]);
    expect(parseCommandBarcode('9900000137', so137)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('etiqueta com muitos zeros à esquerda vale pela leitura EXATA, não por janela', () => {
    // "0000000137" → 137 pelo número inteiro. A janela do começo produzia "1",
    // que também é ativa; a precedência do exato é o que resolve.
    expect(parseCommandBarcode('0000000137', active)).toMatchObject({ number: 137, reason: 'OK' });
  });

  it('recusa número fora da sequência ativa, mas devolve o palpite p/ a tela avisar', () => {
    const r = parseCommandBarcode('9999', active);
    expect(r.number).toBeNull();
    expect(r.reason).toBe('NOT_ACTIVE');
    expect(r.guess).toBe(9999);
  });

  /* O cartão da rede traz um QR do Instagram além do código de barras. Leitor de
     mão 2D lê os dois, e no vídeo de 19/08/2026 o QR aparecia na conferência
     como "código sem número", em vermelho, a cada comanda bipada. Não é defeito:
     é parte do cartão, e a tela precisa saber distinguir para ignorar. */
  it('reconhece o QR do cartão como NÃO-comanda, em vez de acusar erro', () => {
    const r = parseCommandBarcode('https://www.instagram.com/churrascariabeijaflor/', active);
    expect(r.reason).toBe('NOT_A_COMMAND');
    expect(r.number).toBeNull();
  });

  it('trata qualquer URL como não-comanda', () => {
    expect(isNotACommand('https://exemplo.com')).toBe(true);
    expect(isNotACommand('www.exemplo.com')).toBe(true);
    expect(isNotACommand('algo://outro')).toBe(true);
  });

  it('não confunde comanda com URL', () => {
    expect(isNotACommand('0346')).toBe(false);
    expect(isNotACommand('CMD-0137')).toBe(false);
    expect(isNotACommand('')).toBe(false);
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

  /* A ambiguidade que este teste registrava foi ELIMINADA pela calibração de
     19/08/2026: medido no cartão real, a etiqueta traz "0346" em CODE_128 — 4
     dígitos, sem prefixo nem verificador. Etiqueta curta passou a ser lida de
     forma EXATA, então "1346" não vira mais 346 (a janela final "346" existia na
     sequência e a conferência marcaria presente uma comanda que não está na mesa). */
  it('etiqueta curta é EXATA: 1346 não vira 346 por coincidência de sufixo', () => {
    const r = parseCommandBarcode('1346', active);
    expect(r.number).toBeNull();
    expect(r.reason).toBe('NOT_ACTIVE');
    expect(r.guess).toBe(1346);
  });

  it('"0346" não gera mais o palpite perigoso 34', () => {
    expect(candidateNumbers('0346')).toEqual([346]);
  });

  it('código LONGO de padrão desconhecido mantém a tolerância por janelas', () => {
    // 10 dígitos com a comanda no fim — outra gráfica, outro padrão
    expect(parseCommandBarcode('9900000137', active)).toMatchObject({ number: 137, reason: 'OK' });
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
