import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { roleLabel } from '@/lib/roles';
import { effectivePermissions } from '@/lib/permissions';
import { RETENTION_MONTHS_DEFAULT, TERMS_VERSION } from '@/lib/lgpd';
import { LargeTitle } from '@/components/layout/page-chrome';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { shortUnitName } from '@/lib/unit-name';
import { ScrollText, Building2, Users, ListChecks, Wallet, KeyRound, ClipboardList, Trash2, AlertTriangle, Truck, Coins } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Configurações em 4 seções (Onda 5). Eram 16 blocos numa grade plana, todos
 * com o mesmo peso visual: achar "Perfis de acesso" exigia ler rótulo por
 * rótulo. Agrupados por ASSUNTO, com um subtítulo dizendo o que cada tela faz.
 */
const SECOES: { titulo: string; itens: { href: string; title: string; subtitle: string; icon: typeof Building2 }[] }[] = [
  {
    titulo: 'Estrutura',
    itens: [
      { href: '/configuracoes/unidades', title: 'Unidades', subtitle: 'Nome, CNPJ, hora de corte e fuso', icon: Building2 },
      { href: '/configuracoes/usuarios', title: 'Usuários', subtitle: 'Cadastro, perfil e vínculo com unidades', icon: Users },
      { href: '/configuracoes/perfis', title: 'Perfis de acesso', subtitle: 'Matriz perfil × módulo (ver/editar)', icon: KeyRound },
    ],
  },
  {
    titulo: 'Rotina da operação',
    itens: [
      { href: '/configuracoes/checklists', title: 'Checklists', subtitle: 'Por unidade, modelos prontos e de supervisor', icon: ListChecks },
      { href: '/configuracoes/fichas', title: 'Fichas', subtitle: 'Checklists preenchidos por link, sem login', icon: ClipboardList },
      { href: '/configuracoes/comandas', title: 'Comandas', subtitle: 'Sequências ativas por unidade', icon: ClipboardList },
      { href: '/configuracoes/troco', title: 'Troco', subtitle: 'Denominações aceitas por unidade', icon: Coins },
      { href: '/configuracoes/desperdicios', title: 'Desperdícios', subtitle: 'Categorias e unidade de medida (kg/un)', icon: Trash2 },
      { href: '/configuracoes/ocorrencias', title: 'Ocorrências', subtitle: 'Tipos e categorias, marcações de TI/Manutenção', icon: AlertTriangle },
    ],
  },
  {
    titulo: 'Cadastros e valores',
    itens: [
      { href: '/configuracoes/fornecedores', title: 'Fornecedores', subtitle: 'Lista única usada por notas, gás e pagamentos', icon: Truck },
      { href: '/configuracoes/produtos', title: 'Catálogo de Produtos', subtitle: 'Itens da Fábrica e do Centro de Distribuição', icon: Truck },
      { href: '/configuracoes/padrao-produtos', title: 'Padrão de produtos', subtitle: 'Fotos de referência para a checagem por IA', icon: ListChecks },
      { href: '/configuracoes/pagamentos', title: 'Pagamentos', subtitle: 'Freelancers, tipos de avulso e aprovadores', icon: Wallet },
      { href: '/configuracoes/freelancer-valores', title: 'Valor do freelancer', subtitle: 'Diária por setor e vale-transporte', icon: Wallet },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { href: '/configuracoes/integracoes', title: 'APIs & Integrações', subtitle: 'RH, chaves de acesso e webhooks', icon: KeyRound },
      { href: '/auditoria', title: 'Auditoria', subtitle: 'Registro imutável de ações críticas', icon: ScrollText },
    ],
  },
];

export default async function ConfiguracoesPage() {
  const user = (await getSessionUser())!;
  const isAdmin = user.role === 'ADMIN' || user.role === 'CEO';

  if (!isAdmin) {
    const isSupervisor = user.role === 'SUPERVISOR';
    const perms = await effectivePermissions(user.role);
    const canCashConfig = Boolean(perms.CASH_CONFIG?.canEdit);
    const canFichas = Boolean(perms.CHECKLIST_FORMS?.canEdit);
    return (
      <div className="space-y-4">
        <LargeTitle title="Configurações" subtitle="O que o seu perfil pode ajustar." />
        <List>
          <ListRow
            href="/perfil"
            title="Meu Perfil"
            subtitle="Dados pessoais e troca de senha"
            leading={<Users className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
          />
          {isSupervisor && (
            <ListRow
              href="/configuracoes/usuarios"
              title="Usuários"
              subtitle="Visualização do cadastro da rede"
              leading={<Users className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
            />
          )}
          {canCashConfig && (
            <ListRow
              href="/configuracoes/troco"
              title="Troco"
              subtitle="Denominações aceitas por unidade"
              leading={<Coins className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
            />
          )}
          {canFichas && (
            <ListRow
              href="/configuracoes/fichas"
              title="Fichas"
              subtitle="Checklists preenchidos por link, sem login"
              leading={<ClipboardList className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
            />
          )}
        </List>
        <p className="text-xs text-ink-500">As demais configurações são restritas ao Administrador.</p>
      </div>
    );
  }

  const [units, users] = await Promise.all([
    prisma.unit.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true, active: true } }),
  ]);

  return (
    <div className="space-y-5">
      <LargeTitle title="Configurações" subtitle="Cadastros e regras que valem para toda a rede." />

      {/* 16 destinos em 4 seções: quem procura sabe onde olhar, em vez de
          varrer uma grade plana lendo rótulo por rótulo. */}
      {SECOES.map((s) => (
        <section key={s.titulo}>
          <h2 className="sgo-type-11 mb-2 text-ink-500">{s.titulo}</h2>
          <List>
            {s.itens.map((it) => (
              <ListRow
                key={it.href}
                href={it.href}
                title={it.title}
                subtitle={it.subtitle}
                leading={<it.icon className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
              />
            ))}
          </List>
        </section>
      ))}

      <section>
        <h2 className="sgo-type-11 mb-2 text-ink-500">Unidades ({units.length})</h2>
        <List>
          {units.map((u) => (
            <ListRow
              key={u.id}
              href="/configuracoes/unidades"
              title={shortUnitName(u.name)}
              subtitle={`${u.code} · corte ${String(u.cutoffHour).padStart(2, '0')}:00 · ${u.timezone}`}
              trailing={u.cnpj ? undefined : <StatusBadge tone="warning" dot>Sem CNPJ</StatusBadge>}
            />
          ))}
        </List>
      </section>

      <section>
        <h2 className="sgo-type-11 mb-2 text-ink-500">Usuários ({users.length})</h2>
        <List>
          {users.map((u) => (
            <ListRow
              key={u.id}
              href="/configuracoes/usuarios"
              title={u.name}
              subtitle={u.email}
              trailing={
                <>
                  {!u.active && <StatusBadge tone="danger" dot>Inativo</StatusBadge>}
                  <span className="text-xs text-ink-500">{roleLabel(u.role)}</span>
                </>
              }
            />
          ))}
        </List>
      </section>

      <section>
        <h2 className="sgo-type-11 mb-2 text-ink-500">LGPD</h2>
        <div className="rounded-card border border-line bg-surface p-4">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-500">Versão do termo</dt>
              <dd className="font-medium tabular-nums text-ink-900">v{TERMS_VERSION}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-500">Retenção de dados sensíveis</dt>
              <dd className="font-medium tabular-nums text-ink-900">{RETENTION_MONTHS_DEFAULT} meses</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-ink-500">
            Anexos sensíveis restritos a Supervisor/Admin/CEO; acessos auditados. Exportação e exclusão de dados do titular disponíveis via API LGPD (Admin).
          </p>
        </div>
      </section>
    </div>
  );
}
