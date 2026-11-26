import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, back: () => {} }), usePathname: () => '/modulos/vagas', useSearchParams: () => new URLSearchParams() }));

import { alertasDaVaga, caminhoDaVaga, cartoesDaLista, casaComABusca, duracao, ETAPAS, filtroPadrao, foraDoPrazo, ordenarVagas, passaNoFiltro, posicaoDaVaga, prazoDeUmDiaUtil } from '@/lib/vagas/acompanhamento';
import { montarPainel, noPeriodo, quemTrouxe } from '@/lib/vagas/painel';
import { horaDeLembrar } from '@/lib/vagas/rotina';
import { ListaDeVagas } from '@/components/vagas/lista-vagas';
import { PainelDeVagas } from '@/components/vagas/painel-vagas';
import { MODULES, RESTRICTED_DEFAULT, MODULOS_INATIVOS } from '@/lib/permissions';
import { regraDaRota } from '@/lib/permissions/guarda-rota-api';
import type { CurriculoDTO, EventoDTO, VagaDTO } from '@/lib/vagas/tipos';

const AGORA = new Date('2026-11-27T15:00:00.000Z'); // sexta, 12h em Brasília
const ha = (dias: number, horas = 0) => new Date(AGORA.getTime() - dias * 86_400_000 - horas * 3_600_000).toISOString();
const ev = (tipo: string, quando: string, origem = 'SGO'): EventoDTO => ({ id: tipo + quando, tipo, origem, descricao: tipo, usuarioNome: origem === 'RH' ? 'RH' : 'Alguém', createdAt: quando });
const cv = (over: Partial<CurriculoDTO> = {}): CurriculoDTO => ({ id: 'c' + Math.random(), number: 1, nomeArquivo: 'a.pdf', mime: 'application/pdf', tamanho: 1, indicadoPor: null, enviadoPorId: null, enviadoPorNome: 'G', enviadoEm: ha(1), removido: false, fluxo: null, decididoPorNome: null, decididoEm: null, motivoRecusa: null, rhEnvioSituacao: null, rhEnvioMotivo: null, rhSituacao: null, rhSituacaoEm: null, rhObservacao: null, ...over });
let n = 0;
function vaga(over: Partial<VagaDTO> = {}): VagaDTO {
  n++;
  return {
    id: `v${n}`, number: n, codigo: `VAGR-${String(n).padStart(4, '0')}`, unitId: 'u1', unitName: 'Unidade Centro', cargoResumo: '1× Garçom', quantidade: 1,
    requisitos: null, observacao: null, inicioDesejado: '2026-12-20', prioridade: 'NORMAL', status: 'PENDENTE_APROVACAO',
    createdById: 'g', createdByName: 'Gerente Ana', createdAt: ha(0, 2), enviadoParaAprovacaoEm: ha(0, 2),
    decididoPorNome: null, decididoEm: null, motivoDevolucao: null, canceladoPorNome: null, canceladoEm: null, motivoCancelamento: null,
    rhEnvioAcao: null, rhEnvioSituacao: null, rhEnvioMotivo: null, rhEnviadoEm: null, rhChegouEm: null, codigoRh: null, rhSituacao: null, rhSituacaoEm: null, rhCandidato: null, rhObservacao: null,
    posicoes: [{ ordem: 1, cargo: 'Garçom', motivo: 'SUBSTITUICAO', substituiNome: 'Carlos Souza', substituiColaboradorId: null, escala: '6x1', horario: '11:00 às 19:20', inicioDesejado: '2026-12-20', requisitos: null, observacao: null }],
    curriculos: [], eventos: [ev('CRIADA', ha(0, 2))], ...over,
  };
}
const noRh = (over: Partial<VagaDTO> = {}) => vaga({ status: 'APROVADA', decididoPorNome: 'Sup', decididoEm: ha(1), rhEnvioAcao: 'criar', rhEnvioSituacao: 'ENVIADO', rhChegouEm: ha(1), ...over });

describe('as 11 etapas e onde a vaga está', () => {
  it('são onze, na ordem do processo', () => {
    expect(ETAPAS).toHaveLength(11);
    expect(ETAPAS.map((e) => e.nome)).toEqual(['Solicitada', 'Aprovação do supervisor', 'Entrega ao RH', 'RH recebeu', 'Vaga numerada', 'Seleção (CapacitaRH)', 'Consulta cadastral', 'Entrevista técnica', 'Candidato aprovado', 'Admissão', 'Contratação concluída']);
  });
  it('cada situação tem a sua etapa e o seu "aguardando"', () => {
    expect(posicaoDaVaga(vaga())).toMatchObject({ etapa: 2, estado: 'normal', aguardando: { quem: 'Supervisor' } });
    expect(posicaoDaVaga(vaga({ status: 'DEVOLVIDA', decididoEm: ha(1) }))).toMatchObject({ etapa: 2, estado: 'devolvida', aguardando: { quem: 'Gerente' } });
    expect(posicaoDaVaga(noRh({ rhChegouEm: null, rhEnvioSituacao: 'NA_FILA' }))).toMatchObject({ etapa: 3, estado: 'normal', aguardando: { quem: 'SGO' } });
    expect(posicaoDaVaga(noRh({ rhChegouEm: null, rhEnvioSituacao: 'ERRO' }))).toMatchObject({ etapa: 3, estado: 'nao-chegou', aguardando: { quem: 'Supervisor' } });
    expect(posicaoDaVaga(noRh())).toMatchObject({ etapa: 4, aguardando: { quem: 'RH', oQue: 'confirmar o recebimento e numerar a vaga.' } });
    expect(posicaoDaVaga(noRh({ rhSituacao: 'recebida', rhSituacaoEm: ha(0, 1) })).etapa).toBe(5);
    expect(posicaoDaVaga(noRh({ rhSituacao: 'vaga_numerada', rhSituacaoEm: ha(0, 1) })).etapa).toBe(6);
    expect(posicaoDaVaga(noRh({ rhSituacao: 'consulta_cadastral', rhSituacaoEm: ha(0, 1) })).etapa).toBe(7);
    expect(posicaoDaVaga(noRh({ rhSituacao: 'entrevista_agendada', rhSituacaoEm: ha(0, 1) }))).toMatchObject({ etapa: 8, aguardando: { quem: 'Gerente' } });
    expect(posicaoDaVaga(noRh({ rhSituacao: 'candidato_aprovado', rhSituacaoEm: ha(0, 1) })).etapa).toBe(10);
    expect(posicaoDaVaga(noRh({ rhSituacao: 'em_admissao', rhSituacaoEm: ha(0, 1) })).etapa).toBe(10);
  });
  it('candidato reprovado volta para a Seleção; concluída e cancelada não aguardam ninguém', () => {
    expect(posicaoDaVaga(noRh({ rhSituacao: 'candidato_reprovado', rhSituacaoEm: ha(0, 1) })).etapa).toBe(6);
    expect(posicaoDaVaga(noRh({ status: 'CONCLUIDA', rhSituacao: 'concluida', rhSituacaoEm: ha(0, 1) }))).toMatchObject({ etapa: 11, estado: 'concluida', aguardando: null });
    expect(posicaoDaVaga(noRh({ status: 'CANCELADA', canceladoEm: ha(0, 1) }))).toMatchObject({ estado: 'cancelada', aguardando: null });
  });
  it('o caminho marca feito, atual e pendente, com as notas', () => {
    const v = noRh({ rhSituacao: 'candidato_reprovado', rhSituacaoEm: ha(0, 1), eventos: [ev('CRIADA', ha(3)), ev('DEVOLVIDA', ha(2, 5)), ev('APROVADA', ha(2)), ev('RH_ENTREGUE', ha(2)), ev('RH_CANDIDATO_REPROVADO', ha(0, 1), 'RH')] });
    const { passos, notas } = caminhoDaVaga(v);
    expect(passos.map((p) => p.situacao)).toEqual(['feita', 'feita', 'feita', 'feita', 'feita', 'atual', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente']);
    expect(notas).toEqual(['Devolvida 1x para ajuste', '1 candidato reprovado — a seleção recomeçou']);
  });
});

describe('durações e o prazo de 1 dia útil', () => {
  it('"30 min", "3 h", "5 dias"', () => {
    expect([duracao(30 * 60_000), duracao(3 * 3_600_000), duracao(5 * 86_400_000), duracao(86_400_000)]).toEqual(['30 min', '3 h', '5 dias', '1 dia']);
  });
  it('sábado e domingo não contam: pedido na sexta vence na segunda', () => {
    const sexta = new Date('2026-11-27T18:00:00.000Z');
    expect(prazoDeUmDiaUtil(sexta).toISOString()).toBe('2026-11-30T18:00:00.000Z');
    expect(prazoDeUmDiaUtil(new Date('2026-11-24T18:00:00.000Z')).toISOString()).toBe('2026-11-25T18:00:00.000Z');
    expect(foraDoPrazo(sexta, new Date('2026-11-29T23:00:00.000Z'))).toBe(false);
    expect(foraDoPrazo(sexta, new Date('2026-11-30T18:00:01.000Z'))).toBe(true);
  });
  it('o lembrete só toca em dia útil, das 8h às 18h de Brasília', () => {
    expect(horaDeLembrar(new Date('2026-11-27T15:00:00.000Z'))).toBe(true); // sexta 12h
    expect(horaDeLembrar(new Date('2026-11-27T10:59:00.000Z'))).toBe(false); // sexta 7h59
    expect(horaDeLembrar(new Date('2026-11-27T21:00:00.000Z'))).toBe(false); // sexta 18h
    expect(horaDeLembrar(new Date('2026-11-28T15:00:00.000Z'))).toBe(false); // sábado
  });
});

describe('alertas nos limites', () => {
  const chaves = (v: VagaDTO) => alertasDaVaga(v, AGORA).map((a) => `${a.chave}:${a.nivel}`);
  it('RH parado: 2 dias nada, 3 âmbar, 7 vermelho', () => {
    expect(chaves(noRh({ rhChegouEm: ha(2) }))).toEqual([]);
    expect(chaves(noRh({ rhChegouEm: ha(3) }))).toEqual(['RH_PARADO:ambar']);
    expect(chaves(noRh({ rhChegouEm: ha(6) }))).toEqual(['RH_PARADO:ambar']);
    expect(chaves(noRh({ rhChegouEm: ha(7) }))).toEqual(['RH_PARADO:vermelho']);
  });
  it('início desejado: 6 dias nada, 5 âmbar, passou vermelho', () => {
    expect(chaves(noRh({ inicioDesejado: '2026-12-03' }))).toEqual([]);
    expect(chaves(noRh({ inicioDesejado: '2026-12-02' }))).toEqual(['INICIO_PROXIMO:ambar']);
    expect(chaves(noRh({ inicioDesejado: '2026-11-26' }))).toEqual(['INICIO_PASSOU:vermelho']);
  });
  it('devolvida há 2 dias, candidato reprovado, não chegou e fora do prazo do supervisor', () => {
    expect(chaves(vaga({ status: 'DEVOLVIDA', decididoEm: ha(1) }))).toEqual([]);
    expect(chaves(vaga({ status: 'DEVOLVIDA', decididoEm: ha(2) }))).toEqual(['DEVOLVIDA_PARADA:ambar']);
    expect(chaves(noRh({ rhSituacao: 'candidato_reprovado', rhSituacaoEm: ha(0, 1) }))).toEqual(['CANDIDATO_REPROVADO:ambar']);
    expect(chaves(noRh({ rhChegouEm: null, rhEnvioSituacao: 'ERRO' }))).toEqual(['NAO_CHEGOU:vermelho']);
    expect(chaves(vaga({ enviadoParaAprovacaoEm: ha(0, 2) }))).toEqual([]);
    expect(chaves(vaga({ enviadoParaAprovacaoEm: ha(2) }))).toEqual(['PRAZO_DO_SUPERVISOR:vermelho']);
  });
  it('a alteração que não chegou é âmbar e não tira a vaga do RH; concluída e cancelada não alertam', () => {
    const v = noRh({ rhEnvioAcao: 'atualizar', rhEnvioSituacao: 'ERRO' });
    expect(chaves(v)).toEqual(['ALTERACAO_NAO_CHEGOU:ambar']);
    expect(posicaoDaVaga(v).etapa).toBe(4);
    expect(chaves(noRh({ status: 'CONCLUIDA', rhChegouEm: ha(30), inicioDesejado: '2026-01-01' }))).toEqual([]);
    expect(chaves(noRh({ status: 'CANCELADA', rhChegouEm: ha(30) }))).toEqual([]);
  });
});

describe('lista: ordem, filtros, cartões e busca', () => {
  it('primeiro o que espera o supervisor (urgente e mais antiga), depois vermelho, âmbar e o início mais próximo', () => {
    const a = vaga({ enviadoParaAprovacaoEm: ha(0, 1) });
    const b = vaga({ enviadoParaAprovacaoEm: ha(0, 3) });
    const u = vaga({ prioridade: 'URGENTE', enviadoParaAprovacaoEm: ha(0, 1) });
    const vermelho = noRh({ rhChegouEm: ha(8) });
    const ambar = noRh({ rhChegouEm: ha(4) });
    const longe = noRh({ inicioDesejado: '2026-12-30' });
    const perto = noRh({ inicioDesejado: '2026-12-10' });
    const fim = noRh({ status: 'CONCLUIDA' });
    expect(ordenarVagas([fim, longe, ambar, a, vermelho, perto, u, b], AGORA).map((v) => v.id)).toEqual([u.id, b.id, a.id, vermelho.id, ambar.id, perto.id, longe.id, fim.id]);
  });
  it('filtros e o filtro padrão de quem aprova', () => {
    const p = vaga(), dv = vaga({ status: 'DEVOLVIDA', decididoEm: ha(0, 1) });
    const rh = noRh({ curriculos: [cv({ fluxo: 'AGUARDANDO_SUPERVISOR' })] });
    const fim = noRh({ status: 'CANCELADA' });
    expect(passaNoFiltro(p, 'aguardando', AGORA) && !passaNoFiltro(dv, 'aguardando', AGORA)).toBe(true);
    expect(passaNoFiltro(rh, 'curriculos', AGORA) && passaNoFiltro(rh, 'no-rh', AGORA)).toBe(true);
    expect(passaNoFiltro(fim, 'encerradas', AGORA) && !passaNoFiltro(fim, 'sem-curriculo', AGORA)).toBe(true);
    expect(passaNoFiltro(p, 'sem-curriculo', AGORA)).toBe(true);
    expect(filtroPadrao([p, rh], true)).toBe('aguardando');
    expect(filtroPadrao([rh], true)).toBe('curriculos');
    expect(filtroPadrao([p], false)).toBe('todas');
  });
  it('currículo recusado pelo supervisor não conta como "tem currículo"', () => {
    expect(passaNoFiltro(vaga({ curriculos: [cv({ fluxo: 'RECUSADO' })] }), 'sem-curriculo', AGORA)).toBe(true);
    expect(passaNoFiltro(vaga({ curriculos: [cv()] }), 'sem-curriculo', AGORA)).toBe(false);
  });
  it('cartões contam e a busca acha por código, unidade, cargo e quem sai', () => {
    const xs = [vaga({ enviadoParaAprovacaoEm: ha(3) }), vaga({ status: 'DEVOLVIDA', decididoEm: ha(0, 1) }), noRh({ rhSituacao: 'em_selecao', rhSituacaoEm: ha(0, 1) }), noRh({ rhChegouEm: null, rhEnvioSituacao: 'ERRO' }), noRh({ status: 'CONCLUIDA' })];
    const c = cartoesDaLista(xs, AGORA);
    expect(c).toMatchObject({ aguardando: 1, aguardandoForaDoPrazo: 1, devolvidas: 1, noRh: 2, semChegar: 1, concluidas: 1, atencao: 2, atrasadas: 2 });
    expect(c.porEtapa).toEqual([{ nome: 'Entrega ao RH', n: 1 }, { nome: 'Seleção (CapacitaRH)', n: 1 }]);
    const v = xs[0];
    for (const q of [v.codigo, 'centro', 'garcom', 'carlos', 'gerente ana']) expect(casaComABusca(v, q), q).toBe(true);
    expect(casaComABusca(v, 'cozinheiro')).toBe(false);
  });
});

describe('painel', () => {
  it('totais, tempos em horas e dias, % no prazo, origem e quem trouxe o aprovado', () => {
    const rapida = noRh({ createdAt: ha(10), eventos: [ev('CRIADA', ha(10)), ev('APROVADA', ha(10, -3)), ev('RH_CANDIDATO_APROVADO', ha(6), 'RH'), ev('RH_CONCLUIDA', ha(5), 'RH')], status: 'CONCLUIDA', rhSituacao: 'concluida', rhSituacaoEm: ha(5), curriculos: [cv({ rhSituacao: 'contratado' })] });
    const lenta = noRh({ createdAt: ha(9), quantidade: 2, eventos: [ev('CRIADA', ha(9)), ev('APROVADA', ha(4))], posicoes: [vaga().posicoes[0], { ...vaga().posicoes[0], ordem: 2, cargo: 'Cozinheiro', motivo: 'AUMENTO_QUADRO' }] });
    const p = montarPainel([rapida, lenta, vaga({ status: 'CANCELADA' }), vaga({ prioridade: 'URGENTE' })], AGORA);
    expect(p).toMatchObject({ solicitacoes: 4, pessoas: 5, emAberto: 2, urgentes: 1, comOSupervisor: 1, noRh: 1, concluidas: 1, canceladas: 1 });
    expect(p.aprovacaoMediaH).toBeCloseTo((3 + 120) / 2, 5);
    expect(p.aprovacaoNoPrazoPct).toBe(50);
    expect(p.rhAteConcluirDias).toBeCloseTo(5 - 3 / 24, 5);
    expect(p.pedidoAteContratacaoDias).toBe(5);
    expect(p.origem.map((b) => [b.rotulo, b.n])).toEqual([['Sem currículo (CapacitaRH)', 3], ['Com currículo do gerente', 1]]);
    expect(p.quemTrouxeOAprovado).toEqual([{ rotulo: 'Currículo do gerente', n: 1, pct: 100 }]);
    expect(p.pessoasPorCargo[0]).toMatchObject({ rotulo: 'Garçom', n: 4 });
    expect(p.porUnidade).toHaveLength(1);
    expect(p.porUnidade[0]).toMatchObject({ solicitacoes: 4, pessoas: 5, concluidas: 1, canceladas: 1, semCurriculoPct: 75 });
  });
  it('aprovado sem currículo do gerente veio da CapacitaRH; sem aprovado, ninguém trouxe', () => {
    expect(quemTrouxe(noRh({ eventos: [ev('RH_CANDIDATO_APROVADO', ha(1), 'RH')] }))).toBe('CapacitaRH');
    expect(quemTrouxe(noRh())).toBeNull();
  });
  it('o período é pela data do pedido; sem nada para medir, os tempos são nulos', () => {
    const velha = vaga({ createdAt: ha(45) });
    expect([noPeriodo(velha, 'mes', AGORA), noPeriodo(velha, '30', AGORA), noPeriodo(velha, '90', AGORA), noPeriodo(velha, 'tudo', AGORA)]).toEqual([false, false, true, true]);
    const vazio = montarPainel([], AGORA);
    expect([vazio.aprovacaoMediaH, vazio.aprovacaoNoPrazoPct, vazio.rhAteConcluirDias, vazio.pedidoAteContratacaoDias]).toEqual([null, null, null, null]);
    expect(vazio.origem).toEqual([]);
  });
});

describe('telas e permissões', () => {
  it('a lista mostra os cartões, o selo "Sem currículo · CapacitaRH" e a barra das etapas', () => {
    const h = renderToString(<ListaDeVagas vagas={[vaga(), noRh({ codigoRh: 'RH-77', prioridade: 'URGENTE' })]} aprovador={false} agoraISO={AGORA.toISOString()} unidades={[{ id: 'u1', name: 'Unidade Centro' }]} />);
    for (const id of ['cartao-aguardando', 'cartao-devolvidas', 'cartao-no-rh', 'cartao-atencao', 'cartao-concluidas', 'linha-da-vaga', 'cartao-da-vaga', 'barra-de-andamento', 'selo-sem-curriculo']) expect(h, id).toContain(`data-testid="${id}"`);
    expect(h).toContain('RH-77');
    expect(h).toContain('Urgente');
    expect(h).toContain('Aguardando — ');
  });
  it('o painel mostra os cartões, os tempos e a tabela por unidade', () => {
    const h = renderToString(<PainelDeVagas p={montarPainel([vaga(), noRh()], AGORA)} />);
    for (const id of ['painel-de-vagas', 'painel-solicitacoes', 'painel-tempos', 'painel-por-unidade']) expect(h, id).toContain(`data-testid="${id}"`);
  });
  it('três permissões: ver, pedir e — em linha própria — aprovar (Supervisor e Coordenador)', () => {
    expect(MODULES.find((m) => m.key === 'VAGAS')).toMatchObject({ nav: '/modulos/vagas' });
    expect(MODULES.find((m) => m.key === 'VAGAS_APPROVE')).toMatchObject({ parent: 'VAGAS' });
    expect(RESTRICTED_DEFAULT.VAGAS).toEqual(['MANAGER', 'COORDINATOR', 'SUPERVISOR']);
    expect([...(RESTRICTED_DEFAULT.VAGAS_APPROVE ?? [])].sort()).toEqual(['COORDINATOR', 'SUPERVISOR']);
  });
  it('a Central de Currículos antiga sai do menu; as rotas de vaga passam pela guarda', () => {
    expect(MODULOS_INATIVOS.has('RESUMES')).toBe(true);
    expect(regraDaRota('/api/vagas')).toMatchObject({ modulo: 'VAGAS', exigir: 'editar' });
    expect(regraDaRota('/api/vagas/abc')).toMatchObject({ modulo: 'VAGAS', exigir: 'ver' });
    expect(regraDaRota('/api/vagas/abc/curriculo/xyz')).toMatchObject({ modulo: 'VAGAS', exigir: 'ver' });
    for (const arq of ['src/app/api/vagas/route.ts', 'src/app/api/vagas/[id]/route.ts', 'src/app/api/vagas/[id]/curriculo/[cid]/route.ts']) expect(readFileSync(arq, 'utf8'), arq).toContain('guardaDaRota(user.role, req)');
  });
  it('a rota do arquivo confere a unidade da vaga; o gerente de uma unidade só pede para ela', () => {
    expect(readFileSync('src/app/api/vagas/[id]/curriculo/[cid]/route.ts', 'utf8')).toContain('canAccessUnit(user, c.vaga.unitId)');
    expect(readFileSync('src/lib/vagas/acoes.ts', 'utf8')).toContain('if (!user.seesAllUnits && user.unitIds.length === 1) d.unitId = user.unitIds[0];');
  });
});
