import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { historicoDePedidos, STATUS_PEDIDO } from '@/lib/products/pedido';
import { numeroDoPedido } from '@/lib/products/numero-do-pedido';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

/** Data do formulário (`aaaa-mm-dd`) para instante, ou `undefined` se em branco. */
function dia(v: string | undefined, fimDoDia = false): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T${fimDoDia ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * O HISTÓRICO de pedidos internos.
 *
 * A lista dos últimos cinco na tela inicial serve para "cadê o meu pedido".
 * Esta tela serve para as outras perguntas: quando foi a última vez que
 * pedimos muçarela, quantos pedidos fecharam com divergência no mês, o que a
 * Moreira pediu em agosto.
 *
 * Os filtros viajam na URL, então o resultado é compartilhável e volta igual
 * quando alguém aperta "voltar" no navegador.
 */
export default async function HistoricoDePedidosPage({
  searchParams,
}: {
  searchParams: { unit?: string; produto?: string; de?: string; ate?: string; status?: string; gerente?: string };
}) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' }, select: { id: true, name: true },
  });

  const { pedidos } = await historicoDePedidos(user, {
    unitId: searchParams.unit || undefined,
    produto: searchParams.produto?.trim() || undefined,
    de: dia(searchParams.de),
    ate: dia(searchParams.ate, true),
    status: searchParams.status || undefined,
    gerente: searchParams.gerente?.trim() || undefined,
  });

  const campo = 'h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900';

  return (
    <div className="space-y-4">
      <div>
        <Link href="/modulos/produtos" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" />Voltar para Pedidos
        </Link>
        <LargeTitle title="Histórico de pedidos" />
        <p className="text-sm text-ink-500">Filtre por unidade, produto, período, situação ou quem pediu.</p>
      </div>

      {/* Formulário GET: os filtros ficam na URL e o resultado é compartilhável. */}
      <Card><CardContent className="pt-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="f-unit" className="sgo-type-11 text-ink-500">Unidade</label>
            <select id="f-unit" name="unit" defaultValue={searchParams.unit ?? ''} className={campo}>
              <option value="">Todas que eu enxergo</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-produto" className="sgo-type-11 text-ink-500">Produto</label>
            <input id="f-produto" name="produto" defaultValue={searchParams.produto ?? ''} className={campo} placeholder="parte do nome" />
          </div>
          <div>
            <label htmlFor="f-status" className="sgo-type-11 text-ink-500">Situação</label>
            <select id="f-status" name="status" defaultValue={searchParams.status ?? ''} className={campo}>
              <option value="">Qualquer uma</option>
              {Object.entries(STATUS_PEDIDO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-de" className="sgo-type-11 text-ink-500">De</label>
            <input id="f-de" type="date" name="de" defaultValue={searchParams.de ?? ''} className={campo} />
          </div>
          <div>
            <label htmlFor="f-ate" className="sgo-type-11 text-ink-500">Até</label>
            <input id="f-ate" type="date" name="ate" defaultValue={searchParams.ate ?? ''} className={campo} />
          </div>
          <div>
            <label htmlFor="f-gerente" className="sgo-type-11 text-ink-500">Quem pediu</label>
            <input id="f-gerente" name="gerente" defaultValue={searchParams.gerente ?? ''} className={campo} placeholder="parte do nome" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit"><Search className="mr-1 h-4 w-4" />Filtrar</Button>
            <Link href="/modulos/produtos/historico" className="text-sm text-ink-500 hover:text-ink-900">Limpar</Link>
          </div>
        </form>
      </CardContent></Card>

      <p className="text-sm text-ink-500">
        {pedidos.length === 0
          ? 'Nenhum pedido com esses filtros.'
          : `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`}
      </p>

      {pedidos.map((p) => (
        <Link key={p.id} href={`/modulos/produtos/pedido/${p.id}`} className="block">
          <Card className="transition-colors hover:border-brand">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{numeroDoPedido(p.number, p.createdAt)}</p>
                <p className="truncate text-sm text-ink-500">
                  {p.unitName} · {p.createdAt.toLocaleDateString('pt-BR')} · {p.createdByName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-medium ${p.status === 'CONCLUIDO_DIVERGENCIA' ? 'text-warning' : 'text-ink-700'}`}>
                  {p.statusLabel}
                </p>
                <p className="sgo-type-11 text-ink-500">
                  {p.separados}/{p.itens} separados
                  {p.divergencias > 0 && ` · ${p.divergencias} divergência${p.divergencias === 1 ? '' : 's'}`}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
