import Link from 'next/link';
import { ArrowLeft, Stethoscope, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import {
  unidadesDoDiagnostico, diagnosticarUnidade,
  DECISAO_LABEL, DECISAO_MOTIVO, type Decisao,
} from '@/lib/rh/diagnostico';

export const dynamic = 'force-dynamic';

/* A cor diz a gravidade antes de a pessoa ler a linha. */
const TOM: Record<Decisao, 'success' | 'warning' | 'danger' | 'info'> = {
  ATIVO_NO_SGO: 'success',
  ATIVO_DE_FERIAS: 'info',
  ATIVO_AFASTADO: 'info',
  ATIVO_STATUS_DESCONHECIDO: 'warning',
  INATIVO_POR_STATUS: 'danger',
  PULADO_SEM_MATRICULA: 'danger',
  NAO_ENCONTRADO_NO_SGO: 'warning',
};

/* Só o que explica gente faltando — "Ativo no SGO" não precisa de explicação. */
const ORDEM_DO_RESUMO: Decisao[] = ['PULADO_SEM_MATRICULA', 'INATIVO_POR_STATUS', 'ATIVO_DE_FERIAS', 'ATIVO_AFASTADO', 'ATIVO_STATUS_DESCONHECIDO', 'NAO_ENCONTRADO_NO_SGO', 'ATIVO_NO_SGO'];

/**
 * Diagnóstico do RH — por que falta gente numa unidade.
 *
 * O sync decide calado: pula quem não tem matrícula e desliga quem não está
 * "Ativo" no RH. Desligado some de Pessoas, da Escala e do Mapa, e de fora só
 * se via "está faltando gente". Esta tela mostra a decisão de cada pessoa e o
 * motivo — é a resposta para "o RH não está trazendo todo mundo".
 */
export default async function DiagnosticoRhPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  /* Mesma porta da tela de Integrações: estes dados são do grupo inteiro. */
  if (user.role !== 'ADMIN' && user.role !== 'CEO') {
    return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  }

  const unidades = await unidadesDoDiagnostico(user);
  if (unidades.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade cadastrada.</p>;

  const escolhida = unidades.find((u) => u.id === searchParams.unit) ?? unidades[0];
  const d = await diagnosticarUnidade(user, escolhida.id);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes/integracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> APIs &amp; Integrações
      </Link>
      <div>
        <LargeTitle title="Diagnóstico do RH" />
        <p className="text-sm text-ink-500">
          Lado a lado: o que o RH devolve e o que o SGO tem. Mostra <b>quem não chegou e por quê</b> — sem gravar nada.
        </p>
      </div>

      {/* Seletor por link: a tela é de servidor e recarregar é o comportamento certo. */}
      <div className="flex flex-wrap gap-1.5">
        {unidades.map((u) => (
          <Link
            key={u.id}
            href={`/configuracoes/integracoes/diagnostico?unit=${u.id}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${u.id === escolhida.id ? 'border-brand bg-brand text-on-brand' : 'text-ink-700'}`}
          >
            {u.name}
          </Link>
        ))}
      </div>

      {d === null ? (
        <p className="text-sm text-ink-500">Unidade fora do seu escopo.</p>
      ) : (
        <>
          {/* ── O casamento do nome: a causa mais boba de "não veio ninguém" ── */}
          <Card><CardContent className="space-y-2 pt-4">
            <p className="text-sm">
              <span className="text-ink-500">Nome no RH configurado:</span>{' '}
              {d.rhUnitName ? <b className="text-ink-900">{d.rhUnitName}</b> : <i className="text-danger">não definido</i>}
            </p>
            {d.outrasRazoes.length > 0 && (
              <p className="text-sm" data-testid="outras-razoes">
                <span className="text-ink-500">Também lê (razões sociais adicionais):</span>{' '}
                {d.outrasRazoes.map((r) => <b key={r} className="mr-2 text-ink-900">{r}</b>)}
              </p>
            )}
            {d.nomeConfere === true && (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Esse nome existe na lista de unidades do RH.
              </p>
            )}
            {d.nomeConfere === false && (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-danger">
                  <TriangleAlert className="h-4 w-4" /> Esse nome NÃO existe na lista de unidades do RH.
                </p>
                <p className="mt-1 text-ink-700">
                  Enquanto não bater exatamente, o RH devolve uma lista vazia para esta unidade. Corrija em
                  Configurações → Unidades. Nomes do RH para comparar:
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink-700">
                  {d.parecidas.map((p) => <li key={p}><code>{p}</code></li>)}
                </ul>
              </div>
            )}
            {d.erro && (
              <p className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{d.erro}</p>
            )}
            <p className="text-sm text-ink-700">
              O RH devolveu <b className="tabular-nums">{d.totalNoRh}</b> pessoa(s) · o SGO tem{' '}
              <b className="tabular-nums">{d.ativosNoSgo}</b> ativa(s) nesta unidade.
            </p>
          </CardContent></Card>

          {/* ── Resumo: o número que explica a diferença ── */}
          {d.totalNoRh > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ORDEM_DO_RESUMO.map((k) => (
                <div key={k} className="rounded-lg border p-2">
                  <p className="text-xl font-bold tabular-nums text-ink-900">{d.resumo[k]}</p>
                  <p className="text-[11px] text-ink-700">{DECISAO_LABEL[k]}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Os motivos, escritos por extenso ── */}
          {ORDEM_DO_RESUMO.filter((k) => k !== 'ATIVO_NO_SGO' && d.resumo[k] > 0).map((k) => (
            <p key={k} className="rounded-lg border border-line-strong bg-sunken p-2 text-sm text-ink-700">
              <b>{d.resumo[k]} × {DECISAO_LABEL[k]}:</b> {DECISAO_MOTIVO[k]}
            </p>
          ))}

          {/* ── Pessoa a pessoa ── */}
          {d.pessoas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-2 py-1.5 font-semibold text-ink-700">Nome no RH</th>
                    <th className="px-2 py-1.5 font-semibold text-ink-700">Matrícula</th>
                    <th className="px-2 py-1.5 font-semibold text-ink-700">Cargo</th>
                    {d.outrasRazoes.length > 0 && <th className="px-2 py-1.5 font-semibold text-ink-700">Razão social</th>}
                    <th className="px-2 py-1.5 font-semibold text-ink-700">Status no RH</th>
                    <th className="px-2 py-1.5 font-semibold text-ink-700">No SGO</th>
                  </tr>
                </thead>
                <tbody>
                  {d.pessoas.map((p, i) => (
                    <tr key={`${p.matricula ?? 'sem'}-${i}`} className="border-b border-line">
                      <td className="px-2 py-1.5 text-ink-900">
                        {p.nome}
                        {/* Divergência de nome entre os dois lados é pista de cadastro duplicado. */}
                        {p.nomeNoSgo && p.nomeNoSgo !== p.nome && (
                          <span className="block text-[10px] text-ink-500">no SGO: {p.nomeNoSgo}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-ink-700">
                        {p.matricula ?? <span className="font-semibold text-danger">sem matrícula</span>}
                      </td>
                      <td className="px-2 py-1.5 text-ink-700">{p.cargo ?? '—'}</td>
                      {d.outrasRazoes.length > 0 && <td className="px-2 py-1.5 text-xs text-ink-500">{p.razao}</td>}
                      <td className="px-2 py-1.5 text-ink-700">{p.statusNoRh}</td>
                      <td className="px-2 py-1.5">
                        <StatusBadge tone={TOM[p.decisao]} dot>{DECISAO_LABEL[p.decisao]}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── O outro lado: está no SGO e o RH não devolveu ── */}
          {d.soNoSgo.length > 0 && (
            <Card><CardContent className="pt-4">
              <p className="text-sm font-semibold text-ink-900">
                {d.soNoSgo.length} no SGO que o RH não devolveu
              </p>
              <p className="mb-2 text-xs text-ink-700">
                Transferência, desligamento ou matrícula que mudou de lado. Ausência na lista da unidade <b>nunca</b> inativa
                sozinha: a cada sincronização o SGO confere cada um na <b>base inteira do RH</b> — desligado lá sai na hora,
                transferido muda de unidade, e quem não aparece em lugar nenhum só é inativado depois de{' '}
                <b>{d.rodadasParaInativar} dias seguidos</b> ausente (nunca mais de 30% da unidade numa rodada).
                {!d.baseGeralLida && d.soNoSgo.some((c) => c.externalId) && (
                  <> <span className="text-warning">A base inteira do RH não respondeu agora — a coluna da direita fica vazia e nenhum dia é contado.</span></>
                )}
              </p>
              <ul className="space-y-1 text-xs">
                {d.soNoSgo.map((c) => {
                  const g = c.naBaseGeral;
                  const naBase = !c.active
                    ? `Inativo no SGO${c.inactiveSince ? ` desde ${c.inactiveSince.split('-').reverse().join('/')}` : ''}`
                    : g?.tipo === 'DESLIGADO_NO_RH' ? `Base geral: desligado (${g.status || 'sem status'}) — sai na próxima sincronização`
                    : g?.tipo === 'TRANSFERIDO' ? `Base geral: em outra razão social — ${g.razao}`
                    : g?.tipo === 'PRESENTE' ? `Base geral: ativo nesta unidade (${g.razao}) — a lista da unidade veio incompleta`
                    : g?.tipo === 'AUSENTE'
                      ? `Não está na base inteira do RH${c.ausenteDesde ? ` desde ${c.ausenteDesde.split('-').reverse().join('/')}` : ''} · dia ${c.ausenteDias} de ${d.rodadasParaInativar}`
                      : c.externalId ? 'Base geral não consultada' : 'Sem matrícula: não há como conferir';
                  const tom = !c.active ? 'neutral' : g?.tipo === 'DESLIGADO_NO_RH' || g?.tipo === 'AUSENTE' ? 'danger' : g?.tipo === 'TRANSFERIDO' ? 'info' : 'warning';
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1" data-testid={`nao-devolvido-${c.externalId ?? c.id}`}>
                      <span className="text-ink-900">{c.name} <span className="text-ink-500">· {c.externalId ?? 'sem matrícula'}</span></span>
                      <span className="flex items-center gap-2">
                        <span className="text-ink-700">{naBase}</span>
                        <StatusBadge tone={tom} dot>{c.active ? 'Ativo no SGO' : 'Inativo'}</StatusBadge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent></Card>
          )}

          <p className="flex items-start gap-2 text-xs text-ink-500">
            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
            Esta tela só lê — não grava nem sincroniza. Para aplicar, use o botão <b>Sincronizar</b> da unidade em
            Configurações → Unidades. Nenhum dado de CPF ou de folha é exibido aqui.
          </p>
        </>
      )}
    </div>
  );
}
