import { describe, it, expect } from 'vitest';
import { hrefDetalheTarefa, hrefVoltarTarefas } from '@/lib/tasks/links';

describe('Links de Tarefas — o filtro de unidade vai e volta', () => {
  it('ida e volta usam o MESMO filtro', () => {
    /* O par é o ponto: se só um lado carregasse o parâmetro, a volta cairia na
       lista de todas as unidades — que foi o defeito relatado. */
    const ida = hrefDetalheTarefa('abc', 'u1');
    const volta = hrefVoltarTarefas('u1');
    expect(ida).toBe('/tarefas/abc?unit=u1');
    expect(volta).toBe('/tarefas?unit=u1');
  });

  it('sem filtro, a URL fica limpa', () => {
    expect(hrefDetalheTarefa('abc')).toBe('/tarefas/abc');
    expect(hrefVoltarTarefas()).toBe('/tarefas');
    expect(hrefVoltarTarefas('')).toBe('/tarefas');
    expect(hrefVoltarTarefas('   ')).toBe('/tarefas');
  });

  it('várias unidades de uma vez continuam valendo', () => {
    /* A lista aceita "id1,id2" — a vírgula precisa sobreviver ao encode. */
    expect(hrefVoltarTarefas('u1,u2')).toBe('/tarefas?unit=u1%2Cu2');
  });

  it('a volta nunca sai de /tarefas', () => {
    /* O parâmetro é dado do usuário; o destino não pode virar outro site nem
       outra rota por causa dele. */
    for (const veneno of ['https://exemplo.com', '//exemplo.com', '../admin', 'u1&filter=x']) {
      expect(hrefVoltarTarefas(veneno).startsWith('/tarefas?unit=')).toBe(true);
      expect(hrefVoltarTarefas(veneno)).not.toContain('//exemplo');
      expect(hrefVoltarTarefas(veneno)).not.toContain('&filter=');
    }
  });
});
