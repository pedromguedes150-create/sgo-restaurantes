import Link from 'next/link';
import { ArrowLeft, ArrowUpFromLine } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listarEventos, resumoDaFila } from '@/lib/rh/saida/fila';
import { rhSaidaBase, rhSaidaConfigurada, origemDaBase } from '@/lib/rh/saida/config';
import { ENDPOINTS, MAX_TENTATIVAS } from '@/lib/rh/saida/regras';
import { EnviosRhClient } from '@/components/admin/envios-rh-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpis, SgoKpi } from '@/components/sgo/sgo-kpi';
import type { RhOutboundStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

type Filtro = 'PROBLEMAS' | RhOutboundStatus | 'TODOS';
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'PROBLEMAS', label: 'Com problema' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'ENVIADO', label: 'Enviados' },
  { value: 'TODOS', label: 'Todos' },
];

/**
 * Envios ao RH (v1.168.0): a fila de saída SGO→GBF-RH, para o Administrador.
 * Realizados, pendentes e com erro, com o que o RH respondeu e reenvio.
 */
export default async function EnviosRhPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const filtro: Filtro = (FILTROS.find((f) => f.value === searchParams.status)?.value ?? 'PROBLEMAS') as Filtro;
  const [resumo, eventos] = await Promise.all([
    resumoDaFila(),
    listarEventos({ status: filtro === 'TODOS' ? undefined : filtro, limite: 200 }),
  ]);
  const problemas = resumo.erros + resumo.esgotados + resumo.parados;
  const configurado = rhSaidaConfigurada();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes/integracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> APIs &amp; Integrações</Link>
      <LargeTitle
        title="Envios ao RH"
        subtitle={<>Fila de saída SGO → GBF-RH: atestados, desligamentos aprovados e demandas. Base <code>{rhSaidaBase()}</code> ({origemDaBase()}) · token {configurado ? 'configurado' : <b className="text-danger">AUSENTE (RH_WEBHOOK_TOKEN)</b>}.</>}
        tabs={FILTROS.map((f) => ({ label: f.label, href: `/configuracoes/integracoes/envios-rh?status=${f.value}`, active: filtro === f.value, testId: `filtro-${f.value}` }))}
      />

      <SgoKpis>
        <SgoKpi label="Pendentes" value={String(resumo.pendentes + resumo.enviando)} meta="aguardando a hora da próxima tentativa" />
        <SgoKpi label="Enviados" value={String(resumo.enviados)} meta="aceitos pelo RH (inclui duplicados)" />
        <SgoKpi label="Erro de dados" value={String(resumo.erros)} meta="400/422/409 — corrigir e reenviar" />
        <SgoKpi label="Esgotados / parados" value={String(resumo.esgotados + resumo.parados)} meta={`${MAX_TENTATIVAS} tentativas sem sucesso, ou token recusado`} />
      </SgoKpis>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowUpFromLine className="h-4 w-4 text-brand" /> {FILTROS.find((f) => f.value === filtro)?.label} ({eventos.length}{problemas && filtro === 'PROBLEMAS' ? ` de ${problemas}` : ''})</CardTitle></CardHeader>
        <CardContent>
          <EnviosRhClient eventos={eventos} configurado={configurado} />
        </CardContent>
      </Card>

      <details className="rounded-lg border border-line bg-canvas p-3 text-xs text-ink-700">
        <summary className="cursor-pointer font-semibold text-ink-900">Como a fila funciona</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Cada evento tem um <code>sgoEventId</code> fixo: reenviar o mesmo evento nunca cria duplicado no RH (ele responde &ldquo;duplicado&rdquo;, que conta como enviado).</li>
          <li>Temporário (RH fora do ar, 5xx, 404 de módulo ainda não ligado): nova tentativa com espera crescente — 1, 2, 4, 8… minutos até {MAX_TENTATIVAS} tentativas; depois fica <b>Esgotado</b> e continua aqui para reenvio manual.</li>
          <li>Erro de dados (400/422/409): não tenta de novo. Corrija o cadastro (CPF do colaborador, CNPJ da unidade, período do atestado) e use <b>Reenviar</b> — o corpo é remontado do cadastro atual.</li>
          <li>401: token recusado. O despacho para, os Admins são avisados; corrija <code>RH_WEBHOOK_TOKEN</code> e reinicie (ou reenvie).</li>
          <li>Sem token configurado, nada sai e nada se perde: os eventos ficam pendentes.</li>
          <li>Endpoints: <code>{ENDPOINTS.ATESTADO}</code>, <code>{ENDPOINTS.DESLIGAMENTO}</code>, <code>{ENDPOINTS.DEMANDA}</code>. CPF aparece mascarado; anexo e token nunca são gravados nem exibidos.</li>
        </ul>
      </details>
    </div>
  );
}
