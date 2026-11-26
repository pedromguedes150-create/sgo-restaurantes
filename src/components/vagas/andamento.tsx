import { ETAPAS, duracao, type Alerta, type Posicao } from '@/lib/vagas/acompanhamento';

/**
 * A barra das 11 etapas (sem estado, serve à lista e ao detalhe): verde = feita,
 * bordô = onde está, vermelho = devolvida / não chegou, cinza = pendente.
 */
export function BarraDeAndamento({ p }: { p: Posicao }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`Etapa ${p.etapa} de ${ETAPAS.length}: ${p.nome}`} data-testid="barra-de-andamento">
      {ETAPAS.map((e) => {
        const feita = p.estado === 'concluida' || e.n < p.etapa;
        const atual = p.estado !== 'concluida' && e.n === p.etapa;
        const cor = feita ? 'bg-success' : atual ? (p.estado === 'devolvida' || p.estado === 'nao-chegou' ? 'bg-danger' : p.estado === 'cancelada' ? 'bg-ink-400' : 'bg-brand') : 'bg-line-strong';
        return <span key={e.n} title={`${e.n}. ${e.nome}`} className={`h-2 min-w-0 flex-1 rounded-pill ${cor}`} />;
      })}
    </div>
  );
}

export function SelosDeAlerta({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {alertas.map((a) => (
        <span key={a.chave} data-testid={`alerta-${a.chave}`} className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${a.nivel === 'vermelho' ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'}`}>{a.texto}</span>
      ))}
    </span>
  );
}

/** O bloco "Andamento" da linha: barra, etapa, há quanto tempo e o que se espera de quem. */
export function Andamento({ p, alertas, agora, extra }: { p: Posicao; alertas: Alerta[]; agora: number; extra?: string | null }) {
  const ha = duracao(agora - new Date(p.desde).getTime());
  return (
    <div className="min-w-[14rem] space-y-1">
      <BarraDeAndamento p={p} />
      <p className="text-xs text-ink-900"><b>{p.estado === 'cancelada' ? 'Cancelada' : p.estado === 'devolvida' ? 'Devolvida para ajuste' : p.estado === 'nao-chegou' ? 'Não chegou ao RH' : p.nome}</b> <span className="text-ink-500">· há {ha}</span></p>
      {p.aguardando && <p className="text-xs text-ink-700">Aguardando — <b>{p.aguardando.quem}</b>: {p.aguardando.oQue}</p>}
      <SelosDeAlerta alertas={alertas} />
      {extra && <p className="text-xs font-semibold text-warning">{extra}</p>}
    </div>
  );
}
