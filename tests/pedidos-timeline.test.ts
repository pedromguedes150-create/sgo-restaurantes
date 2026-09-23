import { describe, it, expect } from 'vitest';
import { montarTimeline, divergenciaLabel, avaliacaoLabel } from '@/lib/products/entrega-tela';

/**
 * A TIMELINE do pedido.
 *
 * Ela existe para responder "onde está meu pedido?", que é a pergunta que traz
 * o gerente à tela. Por isso o que se mede aqui é sobretudo o que ainda NÃO
 * aconteceu: as quatro etapas aparecem sempre, e a que falta diz que falta.
 */

const base = {
  status: 'ENVIADO_CD',
  createdAt: new Date('2026-09-10T12:00:00Z'),
  createdByName: 'Ana',
  totalItens: 3,
  totalSeparados: 0,
  sentByName: null as string | null,
  sentAt: null as Date | null,
  receivedByName: null as string | null,
  receivedAt: null as Date | null,
};

const etapa = (p: Parameters<typeof montarTimeline>[0], chave: string) =>
  montarTimeline(p).find((e) => e.chave === chave)!;

describe('As cinco etapas aparecem sempre', () => {
  it('pedido recém-feito já mostra as cinco, quatro delas por fazer', () => {
    const t = montarTimeline(base);
    expect(t.map((e) => e.chave)).toEqual(['PEDIDO', 'SEPARACAO', 'CONFERENCIA', 'ENVIO', 'RECEBIMENTO']);
    expect(t.filter((e) => e.feito)).toHaveLength(1);
  });

  it('o que falta diz que falta, em vez de sumir', () => {
    const t = montarTimeline(base);
    expect(etapa(base, 'ENVIO').detalhe).toBe('Ainda não');
    expect(etapa(base, 'SEPARACAO').detalhe).toBe('Ainda não começou');
  });
});

describe('A etapa da separação conta o progresso', () => {
  it('parcial mostra quantos de quantos', () => {
    const e = etapa({ ...base, status: 'SEPARANDO', totalSeparados: 2 }, 'SEPARACAO');
    expect(e.feito).toBe(true);
    expect(e.detalhe).toBe('2 de 3 itens separados');
  });

  it('completa muda o título — não é mais "no CD", é "concluída"', () => {
    const e = etapa({ ...base, status: 'PRONTO_ENVIO', totalSeparados: 3 }, 'SEPARACAO');
    expect(e.titulo).toBe('Separação concluída');
    expect(e.detalhe).toBe('Todos os itens separados');
  });
});

describe('Envio e recebimento', () => {
  const enviado = { ...base, status: 'ENVIADO_UNIDADE', totalSeparados: 3, sentByName: 'Carlos', sentAt: new Date('2026-09-11T09:00:00Z') };

  it('o envio carrega quem deu saída e quando', () => {
    const e = etapa(enviado, 'ENVIO');
    expect(e.feito).toBe(true);
    expect(e.quem).toBe('Carlos');
    expect(e.quando).toEqual(new Date('2026-09-11T09:00:00Z'));
  });

  it('conferido sem problema diz isso com todas as letras', () => {
    const e = etapa({ ...enviado, status: 'CONCLUIDO', receivedByName: 'Ana', receivedAt: new Date('2026-09-11T15:00:00Z') }, 'RECEBIMENTO');
    expect(e.detalhe).toBe('Conferido sem divergência');
  });

  it('conferido com divergência NÃO se disfarça de pedido normal', () => {
    /* Fechar os dois casos com o mesmo rótulo esconderia justamente o pedido
       que alguém precisa olhar. */
    const e = etapa({ ...enviado, status: 'CONCLUIDO_DIVERGENCIA', receivedByName: 'Ana', receivedAt: new Date() }, 'RECEBIMENTO');
    expect(e.detalhe).toBe('Conferido com divergência');
  });

  it('o pedido feito conta os itens no plural certo', () => {
    expect(etapa(base, 'PEDIDO').detalhe).toBe('3 itens');
    expect(etapa({ ...base, totalItens: 1 }, 'PEDIDO').detalhe).toBe('1 item');
  });
});

describe('Os rótulos', () => {
  it('traduzem o código gravado', () => {
    expect(divergenciaLabel('NAO_VEIO')).toBe('Não veio');
    expect(avaliacaoLabel('REGULAR')).toBe('Regular');
  });

  it('sem valor, não inventam texto', () => {
    expect(divergenciaLabel(null)).toBeNull();
    expect(avaliacaoLabel(null)).toBeNull();
  });

  it('código desconhecido volta como veio, em vez de virar vazio', () => {
    /* Um código antigo que saiu da lista ainda precisa aparecer na tela do
       histórico — some seria pior do que feio. */
    expect(divergenciaLabel('MOTIVO_ANTIGO')).toBe('MOTIVO_ANTIGO');
  });
});
