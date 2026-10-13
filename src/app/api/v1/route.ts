import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { API_VERSION } from '@/lib/api-global/formato';
import { catalogoDasEntidades } from '@/lib/api-global/dados';
import { COMPUTADOS, LIMITE_MAXIMO, LIMITE_PADRAO } from '@/lib/api-global/registro';
import { APP_VERSION } from '@/lib/version';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1 — o CATÁLOGO da API Global (v1.167.0): é por aqui que o SGO Geral
 * descobre o resto. Tudo abaixo exige X-API-Key e é só leitura.
 */
export const GET = comApiKey(async () =>
  NextResponse.json({
    sistema: { nome: 'SGO Beija Flor', descricao: 'Sistema de Gestão Operacional dos restaurantes do Grupo Beija-Flor', versao: APP_VERSION, api_version: API_VERSION },
    autenticacao: 'header X-API-Key com a chave do sistema consumidor; sem chave ou chave inválida → 401 em JSON',
    parametros: {
      from: 'AAAA-MM-DD — início do período (inclusive), pelo campo indicado em `periodo` de cada entidade',
      to: 'AAAA-MM-DD — fim do período (inclusive)',
      page: 'página, a partir de 1',
      limit: `itens por página (padrão ${LIMITE_PADRAO}, teto ${LIMITE_MAXIMO})`,
      observacoes: [
        'Sem from/to a lista e o resumo cobrem o histórico inteiro.',
        'Cadastros sem data ignoram from/to.',
        'Todo resumo traz `cobertura` (menor e maior data existentes e o total sem filtro) e `fonte` (tabela, campo do período e os status existentes): um período sem registros NÃO significa sistema vazio — confira a cobertura.',
        'Valores monetários e quantidades saem como número; datas em ISO 8601 (UTC); datas operacionais como AAAA-MM-DD.',
        'Nenhum endpoint devolve senha, hash, token, chave, CPF, chave PIX ou CID.',
      ],
    },
    endpoints: [
      { rota: '/api/v1', descricao: 'Este catálogo.' },
      { rota: '/api/v1/status', descricao: 'Saúde da API.' },
      { rota: '/api/v1/estrutura', descricao: 'Árvore do menu do sistema (áreas → telas), montada do mesmo registro que desenha o menu.' },
      ...COMPUTADOS.map((c) => ({ rota: `/api/v1/${c.slug}`, descricao: c.label, telas: c.telas, parametros: c.parametros, fonte: c.fonte, computado: true })),
      ...catalogoDasEntidades(),
    ],
  }),
);
