import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured, RhApiError } from '@/lib/rh/client';
import { unwrapColaboradores, unwrapUnidades, isAtivo, RhFormatoInesperadoError } from '@/lib/rh/normalize';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Diagnóstico da integração com o RH — por que falta gente numa unidade.
 *
 * O sync decide em silêncio: quem não tem matrícula é pulado, quem tem status
 * diferente de "Ativo" entra desligado, e desligado some da lista de Pessoas, da
 * Escala e do Mapa. Nenhuma dessas decisões deixava rastro visível — de fora só
 * se via "está faltando gente", sem nada para investigar.
 *
 * Esta função repete EXATAMENTE a leitura que o sync faz (mesmo endpoint, mesmo
 * `unwrap`, mesmo `isAtivo`) e mostra a decisão de cada pessoa, com o motivo.
 * Não grava nada: é uma segunda opinião, não um segundo sync.
 *
 * PII: trafega nome, matrícula, cargo e status. **Não traz CPF nem nada de
 * financeiro** — é o que separa esta tela do `/api/rh/test`, que despeja a folha
 * do grupo inteiro e por isso é exclusivo de desenvolvimento.
 */

/** O que aconteceu com uma pessoa que o RH devolveu. */
export type Decisao =
  | 'ATIVO_NO_SGO'
  | 'INATIVO_POR_STATUS'
  | 'PULADO_SEM_MATRICULA'
  | 'NAO_ENCONTRADO_NO_SGO';

export const DECISAO_LABEL: Record<Decisao, string> = {
  ATIVO_NO_SGO: 'Ativo no SGO',
  INATIVO_POR_STATUS: 'Desligado no SGO',
  PULADO_SEM_MATRICULA: 'Nunca entrou',
  NAO_ENCONTRADO_NO_SGO: 'Ainda não sincronizado',
};

export const DECISAO_MOTIVO: Record<Decisao, string> = {
  ATIVO_NO_SGO: 'Aparece normalmente em Pessoas, Escala e Mapa de Funções.',
  INATIVO_POR_STATUS: 'O status no RH não começa com "Ativo", então o sync marcou a pessoa como inativa — e inativo SOME de Pessoas, da Escala e do Mapa.',
  PULADO_SEM_MATRICULA: 'O RH mandou esta pessoa SEM matrícula. O sync pula quem não tem matrícula, então ela nunca chegou ao SGO.',
  NAO_ENCONTRADO_NO_SGO: 'O RH devolve a pessoa, mas ela não está no banco do SGO. Rode a sincronização desta unidade.',
};

export interface PessoaDoDiagnostico {
  matricula: string | null;
  nome: string;
  cargo: string | null;
  statusNoRh: string;
  decisao: Decisao;
  /** Como o nome está gravado no SGO, quando encontrado (pode divergir do RH). */
  nomeNoSgo: string | null;
}

export interface SoNoSgo {
  id: string;
  name: string;
  externalId: string | null;
  active: boolean;
}

export interface DiagnosticoDaUnidade {
  unitId: string;
  unitName: string;
  rhUnitName: string | null;
  /** A razão social configurada existe na lista de unidades do RH? */
  nomeConfere: boolean | null;
  /** Razões sociais do RH parecidas com a configurada — para achar o erro de grafia. */
  parecidas: string[];
  erro: string | null;
  /** Quantos o RH devolveu para esta razão social. */
  totalNoRh: number;
  pessoas: PessoaDoDiagnostico[];
  /** Está no SGO vinculado à unidade, mas o RH não devolveu. */
  soNoSgo: SoNoSgo[];
  resumo: Record<Decisao, number>;
  ativosNoSgo: number;
}

/** Unidades que o usuário pode diagnosticar. */
export async function unidadesDoDiagnostico(user: SessionUser) {
  return prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, rhUnitName: true },
  });
}

/** Aproximação tosca e suficiente: ignora acento, caixa e pontuação. */
function chaveDeComparacao(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function diagnosticarUnidade(user: SessionUser, unitId: string): Promise<DiagnosticoDaUnidade | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true, rhUnitName: true } });
  if (!unit) return null;

  const base: DiagnosticoDaUnidade = {
    unitId: unit.id, unitName: unit.name, rhUnitName: unit.rhUnitName,
    nomeConfere: null, parecidas: [], erro: null,
    totalNoRh: 0, pessoas: [], soNoSgo: [],
    resumo: { ATIVO_NO_SGO: 0, INATIVO_POR_STATUS: 0, PULADO_SEM_MATRICULA: 0, NAO_ENCONTRADO_NO_SGO: 0 },
    ativosNoSgo: 0,
  };

  /* O que o SGO tem hoje — levantado sempre, mesmo se o RH falhar: é metade da
     comparação e é a metade que explica o que o usuário está vendo na tela. */
  const noSgo = await prisma.collaborator.findMany({
    where: { source: 'RH', units: { some: { unitId } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, externalId: true, active: true },
  });
  base.ativosNoSgo = noSgo.filter((c) => c.active).length;

  if (!rhConfigured()) {
    base.erro = 'RH_API_KEY não configurada neste servidor — o sync não roda.';
    return base;
  }
  if (!unit.rhUnitName) {
    base.erro = 'Esta unidade não tem "Nome no RH" definido. Sem ele o sync nem tenta (Configurações → Unidades).';
    return base;
  }

  /* A razão social configurada existe do lado do RH? É a causa mais boba e mais
     comum de "não veio ninguém": um espaço ou um acento de diferença. */
  try {
    const unidadesDoRh = unwrapUnidades(await rh.unidades());
    if (unidadesDoRh.length > 0) {
      const alvo = chaveDeComparacao(unit.rhUnitName);
      base.nomeConfere = unidadesDoRh.some((u) => u === unit.rhUnitName);
      if (!base.nomeConfere) {
        base.parecidas = unidadesDoRh.filter((u) => {
          const k = chaveDeComparacao(u);
          return k === alvo || k.includes(alvo) || alvo.includes(k);
        });
        /* Nenhuma parecida: mostra a lista toda, que é mais útil do que nada. */
        if (base.parecidas.length === 0) base.parecidas = unidadesDoRh.slice(0, 30);
      }
    }
  } catch {
    /* A lista de unidades é um plus; se falhar, o diagnóstico principal segue. */
  }

  let lista;
  try {
    lista = unwrapColaboradores(await rh.colaboradoresDaUnidade(unit.rhUnitName));
  } catch (e) {
    base.erro = e instanceof RhFormatoInesperadoError
      ? `O RH respondeu num formato que o SGO não sabe ler. O sync ABORTA esta unidade (não desliga ninguém). Detalhe: ${e.message}`
      : e instanceof RhApiError
        ? `Falha ao consultar o RH (${e.status}): ${e.message}`
        : `Falha ao consultar o RH: ${e instanceof Error ? e.message : String(e)}`;
    base.soNoSgo = noSgo;
    return base;
  }

  base.totalNoRh = lista.length;
  const porMatricula = new Map(noSgo.filter((c) => c.externalId).map((c) => [c.externalId as string, c]));
  const vistas = new Set<string>();

  for (const c of lista) {
    const matricula = c.matricula ? String(c.matricula) : null;
    const nome = (c.nome ?? '').trim() || (matricula ? `Matrícula ${matricula}` : '(sem nome)');
    const statusNoRh = (c.status ?? '').trim() || '(vazio)';

    let decisao: Decisao;
    let nomeNoSgo: string | null = null;
    if (!matricula) {
      decisao = 'PULADO_SEM_MATRICULA';
    } else {
      vistas.add(matricula);
      const doSgo = porMatricula.get(matricula);
      nomeNoSgo = doSgo?.name ?? null;
      if (!doSgo) decisao = 'NAO_ENCONTRADO_NO_SGO';
      else if (!isAtivo(c.status)) decisao = 'INATIVO_POR_STATUS';
      else decisao = 'ATIVO_NO_SGO';
    }

    base.resumo[decisao]++;
    base.pessoas.push({ matricula, nome, cargo: c.cargo?.trim() || null, statusNoRh, decisao, nomeNoSgo });
  }

  /* Ordem: primeiro o que está errado. Quem abre esta tela está procurando
     problema, não conferindo quem está bem. */
  const peso: Record<Decisao, number> = {
    PULADO_SEM_MATRICULA: 0, INATIVO_POR_STATUS: 1, NAO_ENCONTRADO_NO_SGO: 2, ATIVO_NO_SGO: 3,
  };
  base.pessoas.sort((a, b) => peso[a.decisao] - peso[b.decisao] || a.nome.localeCompare(b.nome, 'pt-BR'));

  base.soNoSgo = noSgo.filter((c) => !c.externalId || !vistas.has(c.externalId));
  return base;
}
