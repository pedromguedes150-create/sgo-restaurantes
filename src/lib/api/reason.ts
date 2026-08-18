import { NextResponse } from 'next/server';

export interface ReasonMap {
  [reason: string]: { msg: string; status: number };
}

/**
 * Traduz o `reason` de uma função de domínio numa resposta JSON.
 *
 * Existe por causa de um jeito de errar que estava repetido em 14 rotas:
 *
 *     const m = REASONS[result.reason];
 *     return NextResponse.json({ error: m.msg }, { status: m.status });
 *
 * Se o motivo não estivesse no mapa — porque alguém acrescentou um `reason`
 * novo na função de domínio e esqueceu a rota — `m` vinha `undefined` e
 * `m.msg` ESTOURAVA. Um erro de validação conhecido virava 500 com corpo HTML;
 * o cliente não achava `error` no JSON e mostrava a mensagem genérica
 * ("Falha"), sem nada que ajudasse quem está no balcão nem quem fosse
 * diagnosticar de longe.
 *
 * Aqui o motivo desconhecido vira 400 com o próprio nome dele na mensagem —
 * feio, mas honesto e rastreável, em vez de silencioso.
 */
export function reasonResponse(reasons: ReasonMap, reason: string, message?: string) {
  const m = reasons[reason] ?? { msg: `Não foi possível concluir (${reason})`, status: 400 };
  /* `message` deixa a função de domínio dizer o detalhe que só ela sabe — o
     número da nota que já existe, por exemplo. Sem isso, o mapa da rota só
     conseguiria mensagens genéricas, e é o detalhe que diz à pessoa o que
     fazer em seguida. */
  return NextResponse.json({ error: message ?? m.msg, reason }, { status: m.status });
}
