import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured, RhApiError } from '@/lib/rh/client';
import { unwrapColaboradores, unwrapUnidades, classificarStatus, RhFormatoInesperadoError } from '@/lib/rh/normalize';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { nomesNoRhDaUnidade } from '@/lib/rh/razoes';
import { situacaoNaBaseGeral, RODADAS_PARA_INATIVAR, type PessoaNaBaseGeral, type SituacaoNaBaseGeral } from '@/lib/rh/nao-devolvidos';
import { isAtivo } from '@/lib/rh/normalize';

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
  | 'ATIVO_DE_FERIAS'
  | 'ATIVO_AFASTADO'
  | 'ATIVO_STATUS_DESCONHECIDO'
  | 'INATIVO_POR_STATUS'
  | 'PULADO_SEM_MATRICULA'
  | 'NAO_ENCONTRADO_NO_SGO';

export const DECISAO_LABEL: Record<Decisao, string> = {
  ATIVO_NO_SGO: 'Ativo no SGO',
  ATIVO_DE_FERIAS: 'De férias (RH)',
  ATIVO_AFASTADO: 'Afastado (RH)',
  ATIVO_STATUS_DESCONHECIDO: 'Ativo, status novo',
  INATIVO_POR_STATUS: 'Desligado no SGO',
  PULADO_SEM_MATRICULA: 'Nunca entrou',
  NAO_ENCONTRADO_NO_SGO: 'Ainda não sincronizado',
};

export const DECISAO_MOTIVO: Record<Decisao, string> = {
  ATIVO_NO_SGO: 'Aparece normalmente em Pessoas, Escala e Mapa de Funções.',
  ATIVO_AFASTADO: 'O RH diz que esta pessoa está afastada. Continua no SGO, mas ao sincronizar o SGO abre um período de afastamento e a Escala mostra AF (não conta como trabalhando) enquanto o RH mantiver o status.',
  ATIVO_DE_FERIAS: 'O RH diz que esta pessoa está de férias. Ao sincronizar, o SGO abre um período de férias (Pessoas → Férias) começando hoje e o estende a cada sincronização enquanto o RH mantiver o status — a Escala deriva o FE desse período, no Planejado e no Realizado. O RH não manda início/fim: dias ANTES da primeira sincronização não são adivinhados; se precisar, corrija o período em Pessoas → Férias.',
  ATIVO_STATUS_DESCONHECIDO: 'O SGO não conhece este status do RH. A pessoa APARECE normalmente (some do sistema é pior do que aparecer a mais), mas confira se ela realmente trabalha — se for um status de desligamento, me avise para eu incluí-lo na regra.',
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
  /** De qual razão social do RH a pessoa veio (v1.166.0 — a unidade pode ler mais de uma). */
  razao: string;
}

export interface SoNoSgo {
  id: string;
  name: string;
  externalId: string | null;
  active: boolean;
  /** v1.171.0 — o que a BASE INTEIRA do RH diz dessa matrícula (nulo = base indisponível/sem matrícula). */
  naBaseGeral: SituacaoNaBaseGeral | null;
  /** Contagem de ausência em curso: desde quando e quantos dias (de `RODADAS_PARA_INATIVAR`). */
  ausenteDesde: string | null;
  ausenteDias: number;
  inactiveSince: string | null;
  inactiveReason: string | null;
}

export interface DiagnosticoDaUnidade {
  unitId: string;
  unitName: string;
  rhUnitName: string | null;
  /** Razões sociais ADICIONAIS lidas junto com a principal (v1.166.0). */
  outrasRazoes: string[];
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
  /** A base inteira do RH respondeu? (sem ela, a coluna "na base geral" fica vazia) */
  baseGeralLida: boolean;
  rodadasParaInativar: number;
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
    unitId: unit.id, unitName: unit.name, rhUnitName: unit.rhUnitName, outrasRazoes: [],
    nomeConfere: null, parecidas: [], erro: null,
    totalNoRh: 0, pessoas: [], soNoSgo: [], baseGeralLida: false, rodadasParaInativar: RODADAS_PARA_INATIVAR,
    resumo: { ATIVO_NO_SGO: 0, ATIVO_DE_FERIAS: 0, ATIVO_AFASTADO: 0, ATIVO_STATUS_DESCONHECIDO: 0, INATIVO_POR_STATUS: 0, PULADO_SEM_MATRICULA: 0, NAO_ENCONTRADO_NO_SGO: 0 },
    ativosNoSgo: 0,
  };

  /* O que o SGO tem hoje — levantado sempre, mesmo se o RH falhar: é metade da
     comparação e é a metade que explica o que o usuário está vendo na tela. */
  const noSgoCru = await prisma.collaborator.findMany({
    where: { source: 'RH', units: { some: { unitId } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, externalId: true, active: true, rhMissingSince: true, rhMissingDays: true, inactiveSince: true, inactiveReason: true },
  });
  const noSgo: SoNoSgo[] = noSgoCru.map((c) => ({
    id: c.id, name: c.name, externalId: c.externalId, active: c.active,
    naBaseGeral: null, ausenteDesde: c.rhMissingSince, ausenteDias: c.rhMissingDays,
    inactiveSince: c.inactiveSince, inactiveReason: c.inactiveReason,
  }));
  base.ativosNoSgo = noSgo.filter((c) => c.active).length;

  if (!rhConfigured()) {
    base.erro = 'RH_API_KEY não configurada neste servidor — o sync não roda.';
    return base;
  }
  if (!unit.rhUnitName) {
    base.erro = 'Esta unidade não tem "Nome no RH" definido. Sem ele o sync nem tenta (Configurações → Unidades).';
    return base;
  }

  const nomes = await nomesNoRhDaUnidade(unit);
  base.outrasRazoes = nomes.slice(1);

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

  /* Todas as razões sociais da unidade, como o sync lê (matrícula repetida vale uma vez). */
  const lista: (ReturnType<typeof unwrapColaboradores>[number] & { _razao: string })[] = [];
  try {
    const vistasNaLeitura = new Set<string>();
    for (const nome of nomes) {
      for (const c of unwrapColaboradores(await rh.colaboradoresDaUnidade(nome))) {
        const k = c.matricula ? String(c.matricula) : null;
        if (k && vistasNaLeitura.has(k)) continue;
        if (k) vistasNaLeitura.add(k);
        lista.push({ ...c, _razao: nome });
      }
    }
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
      const classe = classificarStatus(c.status);
      if (!doSgo) decisao = 'NAO_ENCONTRADO_NO_SGO';
      else if (classe === 'DESLIGADO') decisao = 'INATIVO_POR_STATUS';
      else if (classe === 'FERIAS') decisao = 'ATIVO_DE_FERIAS';
      else if (classe === 'AFASTADO') decisao = 'ATIVO_AFASTADO';
      else if (classe === 'DESCONHECIDO') decisao = 'ATIVO_STATUS_DESCONHECIDO';
      else decisao = 'ATIVO_NO_SGO';
    }

    base.resumo[decisao]++;
    base.pessoas.push({ matricula, nome, cargo: c.cargo?.trim() || null, statusNoRh, decisao, nomeNoSgo, razao: c._razao });
  }

  /* Ordem: primeiro o que está errado. Quem abre esta tela está procurando
     problema, não conferindo quem está bem. */
  const peso: Record<Decisao, number> = {
    PULADO_SEM_MATRICULA: 0, INATIVO_POR_STATUS: 1, ATIVO_DE_FERIAS: 2, ATIVO_AFASTADO: 2, ATIVO_STATUS_DESCONHECIDO: 3, NAO_ENCONTRADO_NO_SGO: 4, ATIVO_NO_SGO: 5,
  };
  base.pessoas.sort((a, b) => peso[a.decisao] - peso[b.decisao] || a.nome.localeCompare(b.nome, 'pt-BR'));

  base.soNoSgo = noSgo.filter((c) => !c.externalId || !vistas.has(c.externalId));

  /* v1.171.0 — a mesma pergunta que o sync faz: o que a BASE INTEIRA do RH diz
     de quem a unidade não devolveu? Só leitura; a decisão (inativar, transferir,
     contar) é do sync. */
  if (base.soNoSgo.some((c) => c.externalId)) {
    try {
      const geral: PessoaNaBaseGeral[] = unwrapColaboradores(await rh.colaboradores())
        .filter((c) => c.matricula)
        .map((c) => ({ matricula: String(c.matricula), status: c.status ?? null, unidade: c.unidade ?? null }));
      if (geral.length > 0) {
        const mapa = new Map(geral.map((p) => [p.matricula, p]));
        const razoes = new Set(nomes);
        for (const c of base.soNoSgo) {
          if (c.externalId) c.naBaseGeral = situacaoNaBaseGeral(c.externalId, mapa, razoes, (s) => !isAtivo(s));
        }
        base.baseGeralLida = true;
      }
    } catch {
      /* Base geral indisponível: a coluna fica vazia e a tela diz isso. */
    }
  }
  return base;
}
