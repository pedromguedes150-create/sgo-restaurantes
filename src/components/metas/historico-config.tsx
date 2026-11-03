import type { CorrecaoDaSupervisao, LinhaDoHistorico } from '@/lib/metas/vigencia';
import { shortUnitName } from '@/lib/unit-name';

/**
 * Histórico da Configuração da Meta (v1.180.0) — renderizado no servidor.
 * Uma linha por gravação: quando, quem, o quê, de → para, vigência e motivo.
 */
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function HistoricoDeConfiguracoes({ linhas }: { linhas: LinhaDoHistorico[] }) {
  if (linhas.length === 0) return <p className="p-3 text-sm text-ink-500">Nenhuma alteração registrada ainda — a partir de agora toda gravação aparece aqui.</p>;
  return (
    <table className="sgo-tbl w-full text-sm" data-testid="historico-config">
      <thead><tr><th className="text-left">Quando</th><th className="text-left">Quem</th><th className="text-left">O quê</th><th className="text-left">De → para</th><th className="text-left">Vale desde</th><th className="text-left">Motivo</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id} data-testid="linha-historico-config">
            <td className="whitespace-nowrap tabular-nums">{quando(l.createdAt)}</td>
            <td className="whitespace-nowrap">{l.userName}</td>
            <td className="whitespace-normal">{l.rotulo}</td>
            <td className="whitespace-nowrap tabular-nums"><span className="text-ink-500">{l.de}</span> → <b>{l.para}</b></td>
            <td className="whitespace-nowrap">{l.vigencia}{l.futura && <span className="sgo-tag sgo-tag--amber ml-2">agendada</span>}</td>
            <td className="min-w-56 whitespace-normal text-xs text-ink-700">{l.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CorrecoesDaSupervisao({ linhas }: { linhas: CorrecaoDaSupervisao[] }) {
  if (linhas.length === 0) return <p className="p-3 text-sm text-ink-500">Nenhuma data corrigida pela supervisão neste mês.</p>;
  return (
    <table className="sgo-tbl w-full text-sm" data-testid="correcoes-supervisao">
      <thead><tr><th className="text-left">Quando</th><th className="text-left">Quem corrigiu</th><th className="text-left">Unidade</th><th className="text-left">Lançamento</th><th className="text-left">Nova data</th><th className="text-right">Desconto</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id}>
            <td className="whitespace-nowrap tabular-nums">{quando(l.createdAt)}</td>
            <td className="whitespace-nowrap">{l.userName}</td>
            <td className="whitespace-nowrap">{shortUnitName(l.unitName)}</td>
            <td>{l.lancamento}</td>
            <td className="whitespace-nowrap tabular-nums">{l.novaData}</td>
            <td className="whitespace-nowrap text-right tabular-nums text-danger">{l.penaltyPct == null ? '—' : `−${String(l.penaltyPct).replace('.', ',')}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
