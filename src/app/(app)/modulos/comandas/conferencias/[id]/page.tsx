import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { detalheDaConferencia, TIPO_LABEL, METODO_LABEL, STATUS_LABEL } from '@/lib/commands/sessao';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { SessaoClient } from '@/components/commands/sessao-client';

export const dynamic = 'force-dynamic';

const hora = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const so = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Uma conferência: em andamento vira tela de trabalho; concluída vira registro.
 *
 * O mesmo endereço serve aos dois porque é a mesma coisa em momentos
 * diferentes — e porque o link do histórico precisa continuar valendo depois de
 * a conferência fechar.
 */
export default async function ConferenciaPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const d = await detalheDaConferencia(user, params.id);
  if (!d) notFound();

  const podeEditar = await canEditModule(user.role, 'COMMANDS');
  const emAndamento = d.status === 'EM_ANDAMENTO';

  return (
    <div className="space-y-4">
      <Link href="/modulos/comandas/conferencias" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft className="h-4 w-4" /> Histórico de conferências
      </Link>

      <div>
        <LargeTitle title={emAndamento ? 'Conferência em andamento' : `Conferência de ${d.operationalDate}`} />
        <p className="text-sm text-ink-500">
          {d.unitName} · {TIPO_LABEL[d.type]} · {METODO_LABEL[d.method]}
          {d.responsavel ? ` · ${d.responsavel}` : ''}
        </p>
      </div>

      {emAndamento ? (
        <SessaoClient
          podeEditar={podeEditar}
          sessao={{
            id: d.id, unitName: d.unitName,
            tipo: TIPO_LABEL[d.type], metodo: METODO_LABEL[d.method],
            metodoId: d.method,
            iniciadaEm: hora(d.startedAt), responsavel: d.responsavel,
            escopo: d.escopo, conferidas: d.conferidas, emUso: d.emUso,
            faltando: d.faltando, pct: d.pct,
          }}
        />
      ) : (
        <>
          {/* ── O resultado congelado ── */}
          <Card><CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={d.status === 'CONCLUIDA' ? 'success' : 'neutral'} dot>{STATUS_LABEL[d.status]}</StatusBadge>
              <span className="text-xs text-ink-500">
                {hora(d.startedAt)}{d.finishedAt ? ` às ${so(d.finishedAt)}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><p className="text-xl font-bold tabular-nums text-ink-900">{d.expected}</p><p className="text-[11px] text-ink-700">Esperadas</p></div>
              <div><p className="text-xl font-bold tabular-nums text-ink-900">{d.conferidas.length}</p><p className="text-[11px] text-ink-700">Conferidas</p></div>
              <div><p className="text-xl font-bold tabular-nums text-ink-900">{d.emUso.length}</p><p className="text-[11px] text-ink-700">Em uso</p></div>
              <div><p className="text-xl font-bold tabular-nums text-danger">{d.absentCount}</p><p className="text-[11px] text-ink-700">Em apuração</p></div>
            </div>
            {d.observation && <p className="text-sm text-ink-700"><b>Observação:</b> {d.observation}</p>}
          </CardContent></Card>

          {/* ── Comanda a comanda: o que permite auditar ── */}
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-900">Como cada comanda foi conferida</p>
            {d.items.length === 0 ? (
              <p className="text-sm text-ink-500">Nenhuma comanda foi marcada nesta conferência.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-2 py-1.5 font-semibold text-ink-700">Comanda</th>
                      <th className="px-2 py-1.5 font-semibold text-ink-700">Situação</th>
                      <th className="px-2 py-1.5 font-semibold text-ink-700">Como</th>
                      <th className="px-2 py-1.5 font-semibold text-ink-700">Horário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((i) => (
                      <tr key={i.number} className="border-b border-line">
                        <td className="px-2 py-1.5 font-medium tabular-nums text-ink-900">{i.number}</td>
                        <td className="px-2 py-1.5 text-ink-700">{i.state === 'EM_USO' ? 'Em uso' : 'Conferida'}</td>
                        <td className="px-2 py-1.5 text-ink-700">{i.method === 'LEITOR' ? 'Leitor' : 'Manual'}</td>
                        <td className="px-2 py-1.5 tabular-nums text-ink-700">{so(i.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {d.faltando.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-semibold text-ink-900">Não localizadas ({d.faltando.length})</p>
              <div className="flex flex-wrap gap-1">
                {d.faltando.map((n) => (
                  <span key={n} className="rounded-md border border-warning px-2 py-1 text-xs font-semibold tabular-nums text-warning">{n}</span>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-700">
                Entraram <b>em apuração</b> — acompanhe em Comandas → Divergências. Perdida ou recuperada é decisão
                de quem apura.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
