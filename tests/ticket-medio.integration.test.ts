import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { definirParticipacao, participantesEm, quadroDeParticipacao, unidadeParticipa } from '@/lib/ticket-media/participacao';
import { gravarImportacao, lerParaPrevia } from '@/lib/ticket-media/importar';
import { getPainel, resumoParaODashboard } from '@/lib/ticket-media/query';

/**
 * TICKET MÉDIO — participação com vigência, importação e consolidado.
 *
 * O que estes casos protegem, em ordem de gravidade:
 *
 * 1. **Unidade nova nasce FORA.** O SGO não tem no cadastro nada que diga
 *    "isto é uma churrascaria" — nome, razão social e CNPJ não servem (várias
 *    unidades dividem a mesma razão social). Se a participação fosse
 *    automática, o Centro de Distribuição entraria no consolidado e o erro
 *    apareceria só como um ticket médio estranho.
 *
 * 2. **Tirar do controle não apaga o passado.** É o motivo de a participação
 *    ter vigência em vez de um booleano.
 *
 * 3. **O consolidado é Σreceita ÷ Σcupons.** A média dos tickets dá um número
 *    parecido e errado.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let churras1: string;
let churras2: string;
let cd: string;
let adminId: string;
let gerenteId: string;

/* Escopo NAS TRÊS UNIDADES DO TESTE, de propósito.
   Com `seesAllUnits`, um `ligar([])` significaria "nenhuma unidade da REDE
   participa" — e `definirParticipacao` faria exatamente isso, desmarcando
   unidades que não são deste arquivo. Está certo no módulo (o Admin desmarcou
   tudo, tudo sai) e errado no teste, que não pode mexer no que não criou: foi
   assim que esta suíte apagou a configuração do banco de desenvolvimento. */
const admin = (): SessionUser => ({ id: adminId, name: 'Ana Admin', role: 'SUPERVISOR', unitIds: [churras1, churras2, cd], seesAllUnits: false, needsTerms: false });
const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gabriel', role: 'MANAGER', unitIds: [churras1], seesAllUnits: false, needsTerms: false });

const CAB = ['Caixa', 'Dt. Emis.', 'Status', 'Vr. Venda', 'Vr. Desc.'];
/** Uma planilha com N cupons iguais, na competência pedida. */
function planilha(qtd: number, venda: number, desconto: number, competencia = '2026-08'): unknown[][] {
  const [ano, mes] = competencia.split('-');
  const linhas: unknown[][] = [CAB];
  for (let i = 0; i < qtd; i++) linhas.push(['001', `15/${mes}/${ano} 12:00:00`, 'Aceita', venda, desconto]);
  return linhas;
}

beforeAll(async () => {
  churras1 = (await prisma.unit.create({ data: { code: `TM1-${sfx}`, name: `Churrascaria Um ${sfx}` } })).id;
  churras2 = (await prisma.unit.create({ data: { code: `TM2-${sfx}`, name: `Churrascaria Dois ${sfx}` } })).id;
  cd = (await prisma.unit.create({ data: { code: `TMCD-${sfx}`, name: `Centro de Distribuicao ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Ana Admin', email: `tm-a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gabriel', email: `tm-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId: churras1 } });
});

beforeEach(async () => {
  await prisma.ticketMediaEntry.deleteMany({ where: { unitId: { in: [churras1, churras2, cd] } } });
  await prisma.ticketMediaParticipation.deleteMany({ where: { unitId: { in: [churras1, churras2, cd] } } });
});

afterAll(async () => {
  await prisma.ticketMediaEntry.deleteMany({ where: { unitId: { in: [churras1, churras2, cd] } } });
  await prisma.ticketMediaParticipation.deleteMany({ where: { unitId: { in: [churras1, churras2, cd] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, gerenteId] } } });
  await prisma.unitMembership.deleteMany({ where: { userId: gerenteId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerenteId] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [churras1, churras2, cd] } } });
  await prisma.$disconnect();
});

const ligar = (ids: string[], competencia: string) => definirParticipacao(admin(), { competencia, participantes: ids });
const soAsMinhas = (us: { unitId: string }[]) => us.map((u) => u.unitId).filter((id) => [churras1, churras2, cd].includes(id));

describe('Unidade nova nasce FORA do Ticket Médio', () => {
  it('sem configuração, nenhuma unidade participa', async () => {
    expect(await unidadeParticipa(churras1, '2026-08')).toBe(false);
    expect(await unidadeParticipa(cd, '2026-08')).toBe(false);
  });

  it('o CD só entra se o Admin marcar — nada é inferido do nome', async () => {
    await ligar([churras1, churras2], '2026-08');
    expect(await unidadeParticipa(cd, '2026-08')).toBe(false);
    expect(soAsMinhas(await participantesEm(admin(), '2026-08')).sort()).toEqual([churras1, churras2].sort());
  });

  it('a tela de configuração lista TODAS, inclusive as que não participam', async () => {
    await ligar([churras1], '2026-08');
    const quadro = (await quadroDeParticipacao(admin(), '2026-08')).filter((u) => [churras1, cd].includes(u.unitId));
    expect(quadro.find((u) => u.unitId === churras1)!.participa).toBe(true);
    expect(quadro.find((u) => u.unitId === cd)!.participa).toBe(false);
  });
});

describe('Vigência — tirar do controle não apaga o histórico', () => {
  it('participou de janeiro a agosto, saiu em setembro', async () => {
    await ligar([churras1], '2026-01');
    await ligar([], '2026-09'); // desmarca

    for (const c of ['2026-01', '2026-05', '2026-08']) {
      expect(await unidadeParticipa(churras1, c)).toBe(true);
    }
    for (const c of ['2026-09', '2026-10']) {
      expect(await unidadeParticipa(churras1, c)).toBe(false);
    }
  });

  it('o consolidado de um mês antigo continua contando a unidade que saiu', async () => {
    await ligar([churras1], '2026-01');
    await gravarImportacao(admin(), {
      unitId: churras1, competencia: '2026-03', fileName: 'marco.xlsx',
      linhas: planilha(100, 50, 0, '2026-03'), podeSubstituir: true,
    });
    await ligar([], '2026-09');

    const antigo = await getPainel(admin(), { competencia: '2026-03' });
    const linha = antigo.linhas.find((l) => l.unitId === churras1);
    expect(linha?.importado).toBe(true);
    expect(linha?.receita).toBe(5000);

    /* E em setembro ela não é cobrada como pendente. */
    const novo = await getPainel(admin(), { competencia: '2026-09' });
    expect(novo.pendentes.some((p) => p.unitId === churras1)).toBe(false);
  });

  it('sair e voltar abre vigência nova — o intervalo no meio fica de fora', async () => {
    await ligar([churras1], '2026-01');
    await ligar([], '2026-09');       // sai: participa até agosto
    await ligar([churras1], '2026-11'); // volta em novembro

    expect(await unidadeParticipa(churras1, '2026-08')).toBe(true);
    expect(await unidadeParticipa(churras1, '2026-09')).toBe(false);
    expect(await unidadeParticipa(churras1, '2026-10')).toBe(false);
    expect(await unidadeParticipa(churras1, '2026-11')).toBe(true);
    expect(await unidadeParticipa(churras1, '2027-02')).toBe(true);
  });

  it('marcar e desmarcar na MESMA competência não deixa vigência invertida', async () => {
    await ligar([churras1], '2026-08');
    await ligar([], '2026-08');
    const vigencias = await prisma.ticketMediaParticipation.findMany({ where: { unitId: churras1 } });
    expect(vigencias).toHaveLength(0);
    expect(await unidadeParticipa(churras1, '2026-08')).toBe(false);
  });

  it('id de unidade fora do alcance derruba a gravação inteira', async () => {
    const r = await definirParticipacao(gerente(), { competencia: '2026-08', participantes: [churras1, churras2] });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('SEM_ACESSO');
    expect(await unidadeParticipa(churras1, '2026-08')).toBe(false);
  });
});

describe('Importação', () => {
  beforeEach(async () => { await ligar([churras1, churras2], '2026-01'); });

  it('soma a planilha e calcula receita e ticket', async () => {
    const r = await lerParaPrevia(admin(), {
      unitId: churras1, competencia: '2026-08', fileName: 'agosto.xlsx', linhas: planilha(200, 100, 20),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previa.coupons).toBe(200);
    expect(r.previa.grossSales).toBe(20000);
    expect(r.previa.discounts).toBe(4000);
    expect(r.previa.receita).toBe(16000);
    expect(r.previa.ticket).toBe(80);
  });

  it('recusa unidade que não participa da competência', async () => {
    const r = await lerParaPrevia(admin(), {
      unitId: cd, competencia: '2026-08', fileName: 'cd.xlsx', linhas: planilha(10, 10, 0),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NAO_PARTICIPA');
  });

  it('RECUSA o arquivo do mês errado — o engano mais provável da rotina', async () => {
    const r = await lerParaPrevia(admin(), {
      unitId: churras1, competencia: '2026-09', fileName: 'agosto.xlsx', linhas: planilha(10, 10, 0, '2026-08'),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('MES_TROCADO');
    expect(r.erro).toContain('Agosto/2026');
    expect(r.erro).toContain('Setembro/2026');
  });

  it('a prévia NÃO grava nada', async () => {
    await lerParaPrevia(admin(), { unitId: churras1, competencia: '2026-08', fileName: 'x.xlsx', linhas: planilha(10, 10, 0) });
    expect(await prisma.ticketMediaEntry.count({ where: { unitId: churras1 } })).toBe(0);
  });

  it('a segunda importação do mesmo mês é recusada, não duplicada', async () => {
    const entrada = { unitId: churras1, competencia: '2026-08', fileName: 'a.xlsx', linhas: planilha(10, 10, 0), podeSubstituir: true };
    expect((await gravarImportacao(admin(), entrada)).ok).toBe(true);
    const segunda = await gravarImportacao(admin(), entrada);
    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    expect(segunda.reason).toBe('DUPLICADO');
    expect(await prisma.ticketMediaEntry.count({ where: { unitId: churras1 } })).toBe(1);
  });

  it('substituir exige permissão — e quem não tem não sobrescreve', async () => {
    const base = { unitId: churras1, competencia: '2026-08', linhas: planilha(10, 10, 0) };
    await gravarImportacao(admin(), { ...base, fileName: 'a.xlsx', podeSubstituir: true });

    const semPermissao = await gravarImportacao(admin(), { ...base, fileName: 'b.xlsx', substituir: true, podeSubstituir: false });
    expect(semPermissao.ok).toBe(false);
    if (semPermissao.ok) return;
    expect(semPermissao.reason).toBe('SEM_PERMISSAO_SUBSTITUIR');

    const gravado = await prisma.ticketMediaEntry.findFirst({ where: { unitId: churras1 } });
    expect(gravado!.fileName).toBe('a.xlsx');
    expect(gravado!.replacedCount).toBe(0);
  });

  it('substituir registra quem, quando e quantas vezes', async () => {
    const base = { unitId: churras1, competencia: '2026-08', podeSubstituir: true };
    await gravarImportacao(admin(), { ...base, fileName: 'a.xlsx', linhas: planilha(10, 10, 0) });
    const r = await gravarImportacao(admin(), { ...base, fileName: 'b.xlsx', linhas: planilha(20, 10, 0), substituir: true });
    expect(r.ok).toBe(true);

    const e = await prisma.ticketMediaEntry.findFirst({ where: { unitId: churras1 } });
    expect(e!.coupons).toBe(20);
    expect(e!.fileName).toBe('b.xlsx');
    expect(e!.replacedCount).toBe(1);
    expect(e!.replacedByName).toBe('Ana Admin');
    expect(e!.replacedAt).not.toBeNull();
    /* Quem importou da primeira vez não é reescrito. */
    expect(e!.importedByName).toBe('Ana Admin');

    const audit = await prisma.auditLog.findMany({ where: { action: 'TICKET_MEDIA_REPLACE', userId: adminId } });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('cupom cancelado fica de fora e é registrado no lançamento', async () => {
    const linhas = planilha(10, 100, 0);
    linhas.push(['001', '15/08/2026 12:00:00', 'Cancelada', 500, 0]);
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-08', fileName: 'c.xlsx', linhas, podeSubstituir: true });

    const e = await prisma.ticketMediaEntry.findFirst({ where: { unitId: churras1 } });
    expect(e!.coupons).toBe(10);
    expect(Number(e!.grossSales)).toBe(1000);
    expect(e!.skipped).toBe(1);
    expect(e!.skippedDetail).toContain('Cancelada');
  });
});

describe('Painel e consolidado', () => {
  beforeEach(async () => {
    await ligar([churras1, churras2], '2026-01');
    /* A (R$ 100.000 / 2.000 cupons) e B (R$ 300.000 / 5.000) — os números do
       pedido: consolidado R$ 57,14, média simples R$ 55,00. */
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-08', fileName: 'a.xlsx', linhas: planilha(2000, 50, 0), podeSubstituir: true });
    await gravarImportacao(admin(), { unitId: churras2, competencia: '2026-08', fileName: 'b.xlsx', linhas: planilha(5000, 60, 0), podeSubstituir: true });
  });

  it('o consolidado é Σreceita ÷ Σcupons, não a média dos tickets', async () => {
    const p = await getPainel(admin(), { competencia: '2026-08' });
    expect(p.total.coupons).toBe(7000);
    expect(p.total.receita).toBe(400000);
    expect(p.total.ticket).toBeCloseTo(57.14, 2);
    expect(p.total.ticket).not.toBe(55);
  });

  it('marca completo quando todas as participantes importaram', async () => {
    const p = await getPainel(admin(), { competencia: '2026-08' });
    const minhas = p.linhas.filter((l) => [churras1, churras2].includes(l.unitId));
    expect(minhas.every((l) => l.importado)).toBe(true);
    expect(minhas.filter((l) => !l.importado)).toHaveLength(0);
  });

  it('parcial quando falta unidade — e diz qual', async () => {
    await prisma.ticketMediaEntry.deleteMany({ where: { unitId: churras2, competence: '2026-08' } });
    const p = await getPainel(admin(), { competencia: '2026-08' });
    expect(p.completo).toBe(false);
    expect(p.pendentes.some((x) => x.unitId === churras2)).toBe(true);
    /* O número ainda é calculado — mas o painel o marca como parcial. */
    expect(p.total.ticket).toBe(50);
  });

  it('a comparação com o mês anterior usa só as unidades presentes nos dois', async () => {
    /* Julho só tem a unidade 1. Se o comparativo somasse o mês cheio contra um
       julho incompleto, acusaria uma queda que é só de importação faltando. */
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-07', fileName: 'j.xlsx', linhas: planilha(2000, 40, 0, '2026-07'), podeSubstituir: true });
    const p = await getPainel(admin(), { competencia: '2026-08' });
    expect(p.comparacao.ticket).toBeCloseTo(25, 1); // 50 vs 40, só a unidade 1
  });

  it('o gerente vê só a unidade dele', async () => {
    const p = await getPainel(gerente(), { competencia: '2026-08' });
    expect(p.linhas.map((l) => l.unitId)).toEqual([churras1]);
    expect(p.total.ticket).toBe(50);
  });

  it('o cartão do Dashboard some quando não há participante no alcance', async () => {
    await ligar([], '2026-08');
    const r = await resumoParaODashboard(admin(), { competencia: '2026-08' });
    expect(r).toBeNull();
  });

  it('o cartão do Dashboard traz o consolidado das participantes', async () => {
    const r = await resumoParaODashboard(admin(), { competencia: '2026-08', unitIds: [churras1, churras2] });
    expect(r).not.toBeNull();
    expect(r!.ticket).toBeCloseTo(57.14, 2);
    expect(r!.coupons).toBe(7000);
    expect(r!.completo).toBe(true);
  });

  it('a evolução traz os meses com lançamento', async () => {
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-07', fileName: 'j.xlsx', linhas: planilha(1000, 40, 0, '2026-07'), podeSubstituir: true });
    const p = await getPainel(admin(), { competencia: '2026-08' });
    const julho = p.evolucao.find((e) => e.competencia === '2026-07');
    const agosto = p.evolucao.find((e) => e.competencia === '2026-08');
    expect(julho?.ticket).toBe(40);
    expect(agosto?.ticket).toBeCloseTo(57.14, 2);
  });
});

/**
 * O CARTÃO DO DASHBOARD FICA NO MÊS CORRENTE.
 *
 * Decisão do Pedro, mantida depois de eu levantar a alternativa (mostrar o
 * último mês com lançamento). O que estes casos travam é a consequência dela:
 * o cartão NÃO pode escorregar para o mês passado quando o mês corrente ainda
 * está vazio — ele mostra o mês corrente vazio, que é a cobrança.
 */
describe('O cartão do Dashboard fica no mês corrente', () => {
  beforeEach(async () => { await ligar([churras1, churras2], '2026-01'); });

  it('NÃO mostra o mês passado quando o mês corrente está vazio', async () => {
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-08', fileName: 'a.xlsx', linhas: planilha(100, 50, 0), podeSubstituir: true });
    await gravarImportacao(admin(), { unitId: churras2, competencia: '2026-08', fileName: 'b.xlsx', linhas: planilha(100, 50, 0), podeSubstituir: true });

    const r = await resumoParaODashboard(admin(), { competencia: '2026-09', unitIds: [churras1, churras2] });
    expect(r!.competencia).toBe('2026-09');
    expect(r!.ticket).toBeNull();
    expect(r!.importadas).toBe(0);
    expect(r!.participantes).toBe(2);
    expect(r!.completo).toBe(false);
  });

  it('com o mês corrente parcial, conta só o que já entrou nele', async () => {
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-08', fileName: 'a.xlsx', linhas: planilha(100, 50, 0), podeSubstituir: true });
    await gravarImportacao(admin(), { unitId: churras1, competencia: '2026-09', fileName: 'c.xlsx', linhas: planilha(100, 70, 0, '2026-09'), podeSubstituir: true });

    const r = await resumoParaODashboard(admin(), { competencia: '2026-09', unitIds: [churras1, churras2] });
    expect(r!.competencia).toBe('2026-09');
    expect(r!.ticket).toBe(70); // e não 50, nem a mistura dos dois meses
    expect(r!.importadas).toBe(1);
    expect(r!.participantes).toBe(2);
    expect(r!.completo).toBe(false);
  });

  it('com o mês corrente fechado, marca completo', async () => {
    for (const u of [churras1, churras2]) {
      await gravarImportacao(admin(), { unitId: u, competencia: '2026-09', fileName: 'c.xlsx', linhas: planilha(100, 70, 0, '2026-09'), podeSubstituir: true });
    }
    const r = await resumoParaODashboard(admin(), { competencia: '2026-09', unitIds: [churras1, churras2] });
    expect(r!.completo).toBe(true);
    expect(r!.ticket).toBe(70);
  });

  it('sem lançamento nenhum, fica no mês corrente e diz que está vazio', async () => {
    const r = await resumoParaODashboard(admin(), { competencia: '2026-09', unitIds: [churras1, churras2] });
    expect(r!.competencia).toBe('2026-09');
    expect(r!.ticket).toBeNull();
    expect(r!.importadas).toBe(0);
  });
});
