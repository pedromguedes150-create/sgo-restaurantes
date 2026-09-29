import Link from 'next/link';
import { ArrowLeft, Plug, CheckCircle2, XCircle, ArrowDownToLine, ArrowUpFromLine, Stethoscope, Globe } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { rhConfigured, rhV2Base, rhV2Configured } from '@/lib/rh/client';
import { feriasWebhookConfigured } from '@/lib/rh/webhook';
import { RhV2Ping } from '@/components/admin/rh-v2-ping';
import { ConexoesClient } from '@/components/admin/conexoes-client';
import { listarConexoes, ultimasChamadasExternas, migrarCredenciaisParaChaveDedicada, estadoDaCifra } from '@/lib/conexoes/conexoes';
import { resolverRh } from '@/lib/rh/transporte';
import { ApiGlobalClient } from '@/components/admin/api-global-client';
import { listarSistemas, ultimasChamadas } from '@/lib/api-global/chaves';
import { API_BASE_PATH, HEADER_API_KEY } from '@/lib/api-global/formato';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { LargeTitle } from '@/components/layout/page-chrome';

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
    return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  }

  const baseUrl = 'https://sgorestaurantesgbf.com.br';
  const rhBase = process.env.RH_API_BASE_URL ?? 'https://gbf-rh.replit.app';
  const inboundToken = process.env.RH_INBOUND_TOKEN ?? '';
  const webhookToken = process.env.SGO_WEBHOOK_TOKEN ?? '';
  const webhookUrl = process.env.RH_WEBHOOK_FERIAS_URL ?? `${rhBase}/api/integracoes/sgo/ferias`;

  /* Migração da cifra (v1.132.0): com CONNECTIONS_ENC_KEY definida, o que ainda
     está na chave derivada é recifrado AQUI, antes de a tela ler o estado —
     idempotente, e nada é sobrescrito se não abrir. */
  const migracao = await migrarCredenciaisParaChaveDedicada().catch(() => null);
  const [events, sistemas, chamadas, conexoes, saidas, cifra, rhOrigem] = await Promise.all([
    prisma.rhInboundEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    listarSistemas(),
    ultimasChamadas(30),
    listarConexoes(),
    ultimasChamadasExternas(30),
    estadoDaCifra(),
    resolverRh(),
  ]);
  const rhPelaCentral = rhOrigem.origem === 'conexao';
  const textoDaCifra = cifra.origem === 'dedicada'
    ? (cifra.pendentesNaDerivada > 0 ? `cifrada com CONNECTIONS_ENC_KEY — ${cifra.pendentesNaDerivada} credencial(is) ainda na chave derivada` : 'cifrada no banco com CONNECTIONS_ENC_KEY (chave própria)')
    : cifra.origem === 'derivada' ? 'cifrada no banco com chave derivada de JWT_REFRESH_SECRET' : 'SEM chave de cifra (CONNECTIONS_ENC_KEY)';
  const textoDoUso = rhPelaCentral
    ? `RH — Sincronizar, Diagnóstico e sync diário usam a conexão «${rhOrigem.nome}»${rhOrigem.marcada ? '' : ' (reconhecida pelo endereço; marque o papel "Integração do RH" na conexão para deixar explícito)'}`
    : rhOrigem.origem === 'env' ? 'RH em FALLBACK: nenhuma conexão ativa do RH na Central — usando a configuração antiga do .env' : 'RH sem configuração (nem conexão na Central, nem .env)';
  const ST = { PROCESSED: { label: 'Processado', tone: 'success' as const }, RECEIVED: { label: 'Recebido', tone: 'medium' as const }, ERROR: { label: 'Erro', tone: 'critical' as const } };

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <div>
        <LargeTitle title="APIs &amp; Integrações" />
        <p className="text-sm text-ink-500">Tudo que o SGO consome e expõe. Toda nova API entra aqui. Os valores completos dos tokens ficam no <code>.env</code> do servidor.</p>
      </div>

      {/* 0. API GLOBAL DO SGO (v1.129.0) — o que o SGO expõe para os outros
          sistemas da empresa, com uma chave por sistema. Em paralelo às
          integrações abaixo, que não mudaram. */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-brand" /> API Global do SGO</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <Row k="URL base" v={`${baseUrl}${API_BASE_PATH}`} mono />
            <Row k="Autenticação" v={`header ${HEADER_API_KEY}: <chave do sistema>`} mono />
            <Row k="Teste" v={`GET ${API_BASE_PATH}/status → {"status":"ok","service":"SGO","api_version":"v1"}`} mono />
            <Row k="Sem chave / chave inválida" v="HTTP 401" />
          </div>
          <details className="rounded-lg border border-line bg-canvas p-2 text-xs">
            <summary className="cursor-pointer font-semibold text-ink-900">Como conectar outro sistema</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-ink-700">
              <li>Crie uma chave abaixo com o nome do sistema (RH, Financeiro, Estoque, Compras, BI…).</li>
              <li>Copie a chave na hora — ela aparece uma única vez — e guarde no <code>.env</code> daquele sistema.</li>
              <li>Toda chamada leva o header <code>{HEADER_API_KEY}</code>. Exemplo:</li>
            </ol>
            <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 font-mono text-[11px] text-ink-900">{`curl -H "${HEADER_API_KEY}: sgo_live_…" ${baseUrl}${API_BASE_PATH}/status`}</pre>
            <p className="mt-2 text-ink-500">Cada chamada fica registrada (sistema, endpoint, data/hora, status) — a chave, nunca. Desativar pausa; revogar é definitivo.</p>
          </details>
          <ApiGlobalClient sistemas={sistemas.map((s) => ({
            id: s.id, name: s.name, description: s.description, keyPrefix: s.keyPrefix, keyLast4: s.keyLast4,
            active: s.active, revokedAt: s.revokedAt?.toISOString() ?? null, lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
            createdAt: s.createdAt.toISOString(), createdBy: s.createdBy?.name ?? null, chamadas: s._count.requests,
          }))} />
          <div>
            <p className="mb-1 sgo-type-11 font-semibold text-ink-500">Últimas chamadas ({chamadas.length})</p>
            {chamadas.length === 0 && <p className="text-xs text-ink-500">Nenhuma chamada ainda.</p>}
            <div className="space-y-1">
              {chamadas.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-canvas px-2 py-1 text-xs">
                  <span className="min-w-0 truncate"><b className="text-ink-900">{c.clientName}</b> · <span className="font-mono">{c.method} {c.path}</span></span>
                  <span className="shrink-0 tabular-nums text-ink-500">{c.createdAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · <b className={c.status < 400 ? 'text-success' : 'text-danger'}>{c.status}</b> · {c.durationMs} ms</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 0b. CONEXÕES COM OUTROS SISTEMAS (v1.131.0) — o espelho da seção
          acima: as APIs que ESTE SGO consome, com credencial cifrada no
          servidor. Central administrativa, não API: nenhuma integração de
          produção passa por aqui ainda (o RH segue na v1 do .env). */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4 text-brand" /> Conexões com outros sistemas</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <Row k="O que é" v="APIs externas que este SGO consome — o sentido contrário da API Global (sistemas que consomem o SGO)" />
            <Row k="Credencial" v={textoDaCifra} ok={cifra.origem === 'dedicada' && cifra.pendentesNaDerivada === 0} />
            {migracao && migracao.migradas > 0 && <Row k="Migração da cifra" v={`${migracao.migradas} credencial(is) recifrada(s) com CONNECTIONS_ENC_KEY agora`} ok />}
            {cifra.ilegiveis > 0 && <Row k="Atenção" v={`${cifra.ilegiveis} credencial(is) não abrem com nenhuma chave — recadastre a chave nessas conexões`} ok={false} />}
            <Row k="Em uso pelas integrações" v={textoDoUso} ok={rhPelaCentral} />
          </div>
          <ConexoesClient conexoes={conexoes} cifra={cifra.origem === 'dedicada' && cifra.pendentesNaDerivada === 0 ? 'dedicada' : cifra.origem} />
          <div>
            <p className="mb-1 sgo-type-11 font-semibold text-ink-500">Últimas chamadas de saída ({saidas.length})</p>
            {saidas.length === 0 && <p className="text-xs text-ink-500">Nenhuma chamada ainda.</p>}
            <div className="space-y-1">
              {saidas.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-canvas px-2 py-1 text-xs">
                  <span className="min-w-0 truncate"><b className="text-ink-900">{c.connectionName}</b> · <span className="font-mono">{c.method} {c.path}</span>{c.error ? <span className="text-danger"> · {c.error}</span> : null}</span>
                  <span className="shrink-0 tabular-nums text-ink-500">{c.createdAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · <b className={c.ok ? 'text-success' : 'text-danger'}>{c.status ?? 'sem resposta'}</b> · {c.durationMs} ms</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 1. API do RH (consumo/pull) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDownToLine className="h-4 w-4 text-brand" /> API do RH (consumo — colaboradores/financeiro)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row k="Base" v={rhPelaCentral ? rhOrigem.baseUrl : rhBase} />
          <Row k="Autenticação" v={rhPelaCentral ? `${rhOrigem.authType === 'BEARER' ? 'Authorization: Bearer' : `header ${rhOrigem.authHeader}`} — credencial da conexão «${rhOrigem.nome}», cifrada no servidor` : `header x-api-key = ${mask(process.env.RH_API_KEY)} (.env)`} />
          <Row k="Status" v={rhPelaCentral ? 'Conectado pela Central — sync automático diário ativo' : rhConfigured() ? 'Fallback .env ativo — sync automático diário ativo' : 'SEM CONFIGURAÇÃO (nem conexão na Central, nem RH_API_KEY)'} ok={rhPelaCentral || rhConfigured()} />
          <Row k="Fallback (.env)" v={rhConfigured() ? `RH_API_KEY ${mask(process.env.RH_API_KEY)} em ${rhBase} — usado só se a conexão da Central estiver desativada` : 'não configurado'} />
          <Row k="Endpoints usados" v="/api/ext/colaboradores (vínculo por CNPJ), /api/ext/colaboradores/unidade/:razaoSocial (fallback), /unidades (diagnóstico)" />
          <Row k="Vínculo das unidades" v="CNPJ da unidade ↔ unidade_cnpj do RH; sem CNPJ ou sem correspondência, a razão social (Nome no RH). Empresas do RH sem unidade no SGO são ignoradas" />
          {/* O sync decide calado (pula quem não tem matrícula, desliga quem não
              está "Ativo") e desligado some de Pessoas, da Escala e do Mapa. O
              atalho fica aqui porque é aqui que se vem quando falta gente. */}
          <Link
            href="/configuracoes/integracoes/diagnostico"
            className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-brand/40 bg-brand/5 p-2.5 text-sm hover:bg-brand/10"
          >
            <span className="flex items-center gap-2 font-semibold text-ink-900">
              <Stethoscope className="h-4 w-4 text-brand" /> Diagnóstico do RH — está faltando gente numa unidade?
            </span>
            <span className="text-ink-900">→</span>
          </Link>
        </CardContent>
      </Card>

      {/* 1b. API do RH — v2 (em preparação). Transporte e diagnóstico prontos;
          o sync SEGUE na v1 até o formato da v2 ser validado com uma unidade
          real. O botão de teste roda no servidor do SGO — em produção, no
          droplet — e é o que responde se a v2 aceita a chave de lá. */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDownToLine className="h-4 w-4 text-brand" /> API do RH — v2 (em preparação)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row k="Base" v={rhV2Base()} mono />
          <Row k="Autenticação" v={`header x-api-key = ${mask(process.env.RH_API_V2_KEY)}`} />
          <Row k="Status" v={rhV2Configured() ? 'Chave configurada — aguardando liberação/validação do formato; o sync continua na v1' : 'SEM CHAVE (RH_API_V2_KEY)'} ok={rhV2Configured()} />
          <Row k="Em uso pelo sync" v="Não — v1 continua sendo a produção" />
          <RhV2Ping configurada={rhV2Configured()} />
        </CardContent>
      </Card>

      {/* 2. Recepção RH→SGO (exposição) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowDownToLine className="h-4 w-4 text-brand" /> Recepção RH→SGO (envio automático do RH)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-xs text-ink-500">Configure estas URLs no painel do RH (Integração SGO), com <code>Authorization: Bearer &lt;token&gt;</code>:</p>
          <Row k="Admissão" v={`${baseUrl}/api/integracoes/rh/inclusao`} mono />
          <Row k="Desligamento" v={`${baseUrl}/api/integracoes/rh/desligamento`} mono />
          <Row k="Período aquisitivo" v={`${baseUrl}/api/integracoes/rh/periodo-aquisitivo`} mono />
          <Row k="Exclusão de período" v={`${baseUrl}/api/integracoes/rh/exclusao-periodo`} mono />
          <Row k="Token (RH_INBOUND_TOKEN)" v={mask(inboundToken)} ok={Boolean(inboundToken)} />
          <p className="text-xs text-ink-500">Admissão cria/reativa o colaborador e vincula à unidade (razão social = Configurações → Unidades → nome no RH). Desligamento inativa por CPF. Períodos aquisitivos ficam registrados abaixo. O sync por pull continua funcionando normalmente.</p>
        </CardContent>
      </Card>

      {/* 3. Webhook de férias SGO→RH (saída) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowUpFromLine className="h-4 w-4 text-brand" /> Webhook de férias SGO→RH (saída)</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row k="Destino" v={webhookUrl} mono />
          <Row k="Token (SGO_WEBHOOK_TOKEN)" v={mask(webhookToken)} ok={feriasWebhookConfigured()} />
          <Row k="Dispara em" v="solicitar férias (planejamento) e excluir férias (cancelamento)" />
          <p className="text-xs text-ink-500">⚠️ Cole o MESMO token no painel do RH (campo do token do webhook) para ativar. Sem isso os disparos ficam registrados como erro abaixo.</p>
        </CardContent>
      </Card>

      {/* 4. Últimos eventos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Últimos eventos ({events.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {events.length === 0 && <p className="text-sm text-ink-500">Nenhum evento ainda.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-2 rounded-md bg-canvas p-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{e.event}</p>
                {e.message && <p className="truncate text-ink-500">{e.message}</p>}
                <p className="text-ink-500">{e.createdAt.toLocaleString('pt-BR')}</p>
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
      <span className="shrink-0 text-ink-500">{k}</span>
      <span className={`flex min-w-0 items-center gap-1 text-right font-medium ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {ok === true && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />}
        {ok === false && <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />}
        {v}
      </span>
    </div>
  );
}
