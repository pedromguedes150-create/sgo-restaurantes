import { describe, it, expect, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/modulos/atestados',
  useSearchParams: () => new URLSearchParams(),
}));
import { renderToString } from 'react-dom/server';
import { CertificatesClient } from '@/components/certificates/certificates-client';
import type { CertListItem, CertReport } from '@/lib/certificates/query';

const semSeparadores = (s: string) => s.replace(/<!-- -->/g, '');

/**
 * A tela do gerente na Central de Atestados e Afins (v1.196.0): três passos,
 * sem seletor de tipo/grupo/nomenclatura, foto/PDF obrigatório, e o histórico
 * mostrando a nomenclatura e a situação.
 */
const ver = { canView: true, canEdit: true };
const units = [{ id: 'u1', name: 'Churrascaria Centro' }];
const collaboratorsByUnit = { u1: [{ id: 'c1', name: 'MARIA JOSÉ' }] };
const report: CertReport = { period: { from: '2026-11-01', to: '2026-11-30' }, totals: { count: 2, days: 8 }, byUnit: [], monthlyTrend: [], byWeekday: [], byType: [],
  byGroup: [{ grupo: 'LICENCA', count: 1, days: 5 }, { grupo: 'ATESTADO', count: 1, days: 3 }],
  byNomenclature: [{ rotulo: 'Licença-paternidade', grupo: 'LICENCA', count: 1, days: 5 }, { rotulo: 'Atestado médico', grupo: 'ATESTADO', count: 1, days: 3 }],
  byStatus: [{ status: 'ENVIADO_RH', count: 1 }, { status: 'CORRECAO_SOLICITADA', count: 1 }] };
const linha = (over: Partial<CertListItem>): CertListItem => ({
  id: 'd1', unitId: 'u1', unitName: 'Churrascaria Centro', collaboratorName: 'MARIA JOSÉ', type: 'FULL_DAY', documentGroup: 'LICENCA', nomenclature: 'Licença-paternidade',
  rotulo: 'Licença-paternidade', grupo: 'LICENCA', status: 'ENVIADO_RH', statusNote: null, statusMotivo: null, statusMotivoLabel: null, statusAt: null, eventos: [], collaboratorId: 'c1', alerta: null, nomeDivergente: false,
  issueDate: null, startDate: '2026-11-03', endDate: '2026-11-07', days: 5, hours: null, doctorName: null, doctorCrm: null, cid: null, cidDescription: null,
  attachmentPath: 'uploads/u1/doc.jpg', observation: null, by: 'Ger', ...over,
});
const base = { canLaunch: true, isAdmin: false, showCid: false, ym: '2026-11', units, collaboratorsByUnit, rows: [] as CertListItem[], report, abas: { lancar: ver, historico: ver, painel: ver } as never };

describe('Central de Atestados e Afins — tela do gerente', () => {
  it('o lançamento tem os três passos, dois botões de captura (câmera / galeria-PDF) e NENHUM seletor de tipo, grupo ou nomenclatura', () => {
    const h = semSeparadores(renderToString(<CertificatesClient {...base} />));
    expect(h).toContain('Central de Atestados e Afins');
    expect(h).toContain('1 · Colaborador');
    expect(h).toContain('2 · Documento');
    expect(h).toContain('data-testid="tirar-foto"');
    expect(h).toContain('data-testid="galeria-pdf"');
    expect(h).toContain('capture="environment"');
    expect(h).toContain('accept="image/*,application/pdf"');
    expect(h).not.toMatch(/>Tipo</); // o Select "Tipo" do formulário antigo saiu
    expect(h).not.toContain('Dias de afastamento</'); // nem as opções antigas
    expect(h).not.toContain('Licença-paternidade'); // o gerente não escolhe nomenclatura
    // a conferência (passo 3) só aparece depois do anexo
    expect(h).not.toContain('data-testid="conferencia"');
    // o botão de enviar nasce desligado (sem colaborador nem documento)
    const botao = h.match(/<button[^>]*data-testid="enviar-documento"[^>]*>/)?.[0] ?? "";
    expect(botao).toContain("disabled");
    expect(h).toContain('Enviar documento');
    // CID não aparece para quem não é RH/Admin
    expect(h).not.toContain('CID');
  });

  it('o histórico mostra nomenclatura + grupo + situação, o aviso do RH e o alerta de INSS — sem CID para o gerente', () => {
    const rows = [
      linha({}),
      linha({ id: 'd2', nomenclature: 'Atestado médico', rotulo: 'Atestado médico', grupo: 'ATESTADO', documentGroup: 'ATESTADO', status: 'CORRECAO_SOLICITADA', statusNote: 'Foto cortada — envie o documento inteiro.', days: 16, startDate: '2026-11-10', endDate: '2026-11-25', alerta: 'INSS', cid: '•••' }),
      linha({ id: 'd3', nomenclature: null, documentGroup: null, rotulo: 'Acompanhamento de familiar', grupo: 'COMPARECIMENTO', type: 'COMPANION', status: 'CONCLUIDO' }),
    ];
    const h = semSeparadores(renderToString(<CertificatesClient {...base} canLaunch={false} rows={rows} abaPedida="historico" />));
    expect(h).toContain('Licença-paternidade');
    expect(h).toContain('Licença</span>');
    expect(h).toContain('Enviado ao RH');
    expect(h).toContain('Correção solicitada');
    expect(h).toContain('Foto cortada — envie o documento inteiro.');
    expect(h).toContain('análise do INSS');
    expect(h).toContain('Acompanhamento de familiar'); // registro antigo entra pelo tipo de sempre
    expect(h).toContain('Concluído');
    expect(h).not.toContain('CID •••');
  });

  it('v1.197.0: com Correção solicitada o gerente vê o motivo do RH em destaque, o botão "Corrigir e reenviar" e a linha do tempo; validado não tem botão', () => {
    const rows = [
      linha({ id: 'd9', status: 'CORRECAO_SOLICITADA', statusMotivo: 'foto_cortada', statusMotivoLabel: 'Foto cortada', statusNote: 'Envie o documento inteiro.', eventos: [{ kind: 'SITUACAO', fromStatus: 'ENVIADO_RH', toStatus: 'CORRECAO_SOLICITADA', motivo: 'foto_cortada', note: 'Envie o documento inteiro.', attachmentPath: null, origem: 'RH', actorName: 'GBF-RH', at: '2026-11-09T17:00:00.000Z' }] }),
      linha({ id: 'd8', status: 'VALIDADO_RH' }),
    ];
    const h = semSeparadores(renderToString(<CertificatesClient {...base} rows={rows} abaPedida="historico" docPedido="d9" />));
    expect(h).toContain('data-testid="retorno-rh"');
    expect(h).toContain('Foto cortada — Envie o documento inteiro.');
    // com o painel aberto (docPedido), o botão some no d9; sem docPedido ele aparece UMA vez (só no d9, nunca no validado)
    const semDoc = semSeparadores(renderToString(<CertificatesClient {...base} rows={rows} abaPedida="historico" />));
    expect((semDoc.match(/data-testid="corrigir-reenviar"/g) ?? []).length).toBe(1);
    expect(semDoc).not.toContain('data-testid="painel-correcao"');
    expect(h).toContain('Histórico do documento (1)');
    expect(h).toContain('ring-2 ring-brand'); // o documento apontado pelo aviso vem destacado
    // com docPedido em correção, o painel já nasce aberto
    expect(h).toContain('data-testid="painel-correcao"');
    expect(h).toContain('Reenviar ao RH');
    expect(h).not.toContain('CID');
  });

  it('o painel traz a situação dos lançamentos e a abertura por grupo e tipo de documento', () => {
    const h = semSeparadores(renderToString(<CertificatesClient {...base} canLaunch={false} abas={{ painel: ver } as never} />));
    expect(h).toContain('data-testid="por-situacao"');
    expect(h).toContain('Enviado ao RH · 1');
    expect(h).toContain('Correção solicitada · 1');
    expect(h).toContain('data-testid="por-grupo"');
    expect(h).toContain('Licenças');
    expect(h).toContain('Licença-paternidade');
    expect(h).toContain('Documentos no mês');
  });
});
