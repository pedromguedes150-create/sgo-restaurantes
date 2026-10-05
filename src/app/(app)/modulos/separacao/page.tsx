import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listarParaSeparacao } from '@/lib/products/pedido';
import { pendentesDeClassificacao } from '@/lib/products/classificacao';
import { setoresAtivosDoCd } from '@/lib/products/setores';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ClassificacaoClient } from '@/components/products/classificacao-client';
import { PackageCheck, PackageSearch, Clock, Printer } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * A FILA DO SEPARADOR.
 *
 * Um separador do CD abre isto e vê só o que é dele: os pedidos que têm item do
 * SEU setor, e o progresso contado sobre esses itens. Os pedidos que não tocam
 * o setor dele não aparecem — e por isso um pedido só de Bebidas nunca fica
 * "esperando" o separador de Secos.
 *
 * A ordem é a de chegada, a mais antiga em cima: quem pediu primeiro é atendido
 * primeiro, e o pedido esquecido no fim da fila fica visível em vez de sumir.
 *
 * ADMIN/CEO veem tudo — e veem também o que NINGUÉM vê: os itens sem setor
 * ("Pendentes de classificação"), com o setor a definir na própria linha.
 */
export default async function SeparacaoPage() {
  const user = (await getSessionUser())!;
  const vejoTudo = user.role === 'ADMIN' || user.role === 'CEO';
  const [{ setorId, setorNome, pedidos }, pendentes, setores] = await Promise.all([
    listarParaSeparacao(user),
    vejoTudo ? pendentesDeClassificacao() : Promise.resolve([]),
    vejoTudo ? setoresAtivosDoCd() : Promise.resolve([]),
  ]);

  const grupos = [
    { titulo: 'Novos', icone: PackageSearch, lista: pedidos.filter((p) => p.status === 'AGUARDANDO') },
    { titulo: 'Em andamento', icone: Clock, lista: pedidos.filter((p) => p.status === 'SEPARANDO') },
    { titulo: 'Separados', icone: PackageCheck, lista: pedidos.filter((p) => p.status === 'CONCLUIDO') },
  ];

  return (
    <div className="space-y-4">
      {/* Cabeçalho do kit (Fase 4). ROMANEIO POR SETOR: tudo que o setor
          precisa separar, somando as unidades — o separador tem o do setor
          dele (ação do cabeçalho); ADMIN/CEO escolhem na linha de filtros. */}
      <LargeTitle
        title="Separação de pedidos"
        subtitle={setorNome ? <>Setor <b>{setorNome}</b> — você vê apenas os itens do seu setor.</> : 'Todos os setores do CD.'}
        actions={setorId ? (
          <Link href={`/modulos/separacao/romaneio-setor/${setorId}`} className="sgo-btn">
            <Printer className="h-3.5 w-3.5" /> Romaneio do setor {setorNome} (todas as unidades)
          </Link>
        ) : undefined}
      />
      {vejoTudo && setores.length > 0 && (
        <div className="sgo-filtros -mx-4">
          <span className="sgo-label inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Romaneio por setor</span>
          {setores.map((s) => (
            <Link key={s.id} href={`/modulos/separacao/romaneio-setor/${s.id}`} className="sgo-btn sgo-btn--sm">
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {vejoTudo && <ClassificacaoClient pendentes={pendentes} setores={setores} />}

      {pedidos.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-ink-500">
          Nenhum pedido para separar agora.
        </CardContent></Card>
      )}

      {grupos.map(({ titulo, icone: Icone, lista }) => lista.length > 0 && (
        <section key={titulo} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700">
            <Icone className="h-4 w-4" />{titulo}
            <span className="text-ink-500">({lista.length})</span>
          </h2>
          {lista.map((p) => (
            <Link key={p.id} href={`/modulos/separacao/${p.id}`} className="block">
              <Card className="transition-colors hover:border-brand">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">Pedido nº {p.number}</p>
                    <p className="truncate text-sm text-ink-500">
                      {p.unitName} · {p.createdAt.toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-medium ${p.separados === p.total ? 'text-success' : 'text-ink-700'}`}>
                    {p.separados}/{p.total} itens
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
