import Link from 'next/link';
import { ArrowLeft, Plug, CheckCircle2, XCircle, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { rhConfigured } from '@/lib/rh/client';
import { feriasWebhookConfigured } from '@/lib/rh/webhook';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';

export const dynamic = 'force-dynamic';

const mask = (v: string | undefined) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : '—');

/**
 * Central de APIs & Integrações (pedido do Pedro 07/07): tudo que o SGO
 * consome ou expõe, com endereços, tokens (mascarados) e os últimos eventos.
 * Cada nova API criada deve ser registrada aqui.
 */
export default async function IntegracoesPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') {
    return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;
  }

  const baseUrl = 'https://sgorestaurantesgbf.com.br';
  const rhBase = process.env.RH_API_BASE_URL ?? 'https://gbf-rh.replit.app';
  const inboundToken = process.env.RH_INBOUND_TOKEN ?? '';
  const webhookToken = process.env.SGO_WEBHOOK_TOKEN ?? '';
  const webhookUrl = process.env.RH_WEBHOOK_FERIAS_URL ?? `${rhBase}/api/integracoes/sgo/ferias`;

  const events = await prisma.rhInboundEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 25 });
  const ST = { PROCESSED: { label: 'Processado', tone: 'success' as const }, RECEIVED: { label: 'Recebido', tone: 'medium' as const }, ERROR: { label: 'Erro', tone: 'critical' as const } };

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Plug className="h-5 w-5 text-accent" /> APIs &amp; Integrações</h1>
        <p className="text-sm text-muted-foreground">Tudo que o SGO consome e expõe. Toda nova API entra aqui. Os valores completos dos tokens ficam no <code>.env</code> do servidor.</p>
      </div>

      {/* 1. API do RH (consumo/pull) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDownToLine className="h-4 w-4 text-accent" /> API do RH (consumo — colaboradores/financeiro)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row k="Base" v={rhBase} />
          <Row k="Autenticação" v={`header x-api-key = ${mask(process.env.RH_API_KEY)}`} />
          <Row k="Status" v={rhConfigured() ? 'Configurada — sync automático diário ativo' : 'SEM CHAVE (RH_API_KEY)'} ok={rhConfigured()} />
          <Row k="Endpoints usados" v="/api/ext/colaboradores (sync), /api/ext/financeiro/* (disponível)" />
        </CardContent>
      </Card>

      {/* 2. Recepção RH→SGO (exposição) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDownToLine className="h-4 w-4 text-accent" /> Recepção RH→SGO (envio automático do RH)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">Configure estas URLs no painel do RH (Integração SGO), com <code>Authorization: Bearer &lt;token&gt;</code>:</p>
          <Row k="Admissão" v={`${baseUrl}/api/integracoes/rh/inclusao`} mono />
          <Row k="Desligamento" v={`${baseUrl}/api/integracoes/rh/desligamento`} mono />
          <Row k="Período aquisitivo" v={`${baseUrl}/api/integracoes/rh/periodo-aquisitivo`} mono />
          <Row k="Exclusão de período" v={`${baseUrl}/api/integracoes/rh/exclusao-periodo`} mono />
          <Row k="Token (RH_INBOUND_TOKEN)" v={mask(inboundToken)} ok={Boolean(inboundToken)} />
          <p className="text-xs text-muted-foreground">Admissão cria/reativa o colaborador e vincula à unidade (razão social = Configurações → Unidades → nome no RH). Desligamento inativa por CPF. Períodos aquisitivos ficam registrados abaixo. O sync por pull continua funcionando normalmente.</p>
        </CardContent>
      </Card>

      {/* 3. Webhook de férias SGO→RH (saída) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowUpFromLine className="h-4 w-4 text-accent" /> Webhook de férias SGO→RH (saída)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row k="Destino" v={webhookUrl} mono />
          <Row k="Token (SGO_WEBHOOK_TOKEN)" v={mask(webhookToken)} ok={feriasWebhookConfigured()} />
          <Row k="Dispara em" v="solicitar férias (planejamento) e excluir férias (cancelamento)" />
          <p className="text-xs text-muted-foreground">⚠️ Cole o MESMO token no painel do RH (campo do token do webhook) para ativar. Sem isso os disparos ficam registrados como erro abaixo.</p>
        </CardContent>
      </Card>

      {/* 4. Últimos eventos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Últimos eventos ({events.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {events.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-2 rounded-md bg-surface p-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-brand">{e.event}</p>
                {e.message && <p className="truncate text-muted-foreground">{e.message}</p>}
                <p className="text-muted-foreground">{e.createdAt.toLocaleString('pt-BR')}</p>
              </div>
              <StatusBadge tone={ST[e.status].tone}>{ST[e.status].label}</StatusBadge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v, ok, mono }: { k: string; v: string; ok?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className={`flex min-w-0 items-center gap-1 text-right font-medium ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {ok === true && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />}
        {ok === false && <XCircle className="h-3.5 w-3.5 shrink-0 text-critical" />}
        {v}
      </span>
    </div>
  );
}
