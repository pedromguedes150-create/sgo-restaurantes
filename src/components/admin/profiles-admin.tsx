'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { StatusBadge } from '@/components/ui/status-badge';
import { postPerfis } from '@/lib/admin-client';

export interface PerfilRow {
  id: string;
  name: string;
  baseRole: string;
  baseRoleLabel: string;
  active: boolean;
  usuarios: number;
  ajustes: number;
}
interface Base {
  value: string;
  label: string;
}

export function ProfilesAdmin({ perfis, bases }: { perfis: PerfilRow[]; bases: Base[] }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function criar() {
    if (!nome.trim() || !base) {
      setErro('Informe o nome e o perfil base.');
      return;
    }
    setBusy(true);
    setErro(null);
    const r = await postPerfis({ action: 'create', name: nome, baseRole: base });
    setBusy(false);
    if (!r.ok) {
      setErro(r.error ?? 'Falha');
      return;
    }
    setNome('');
    setBase(null);
    setAbrindo(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Banner
        tone="info"
        title="O perfil base decide as REGRAS DE NEGÓCIO; a matriz decide as TELAS"
        description="Um perfil novo herda do base quem aprova pagamento, quem encerra ocorrência e quem enxerga todas as unidades. O que você ajusta na matriz abaixo são as telas e abas que ele abre."
      />

      {!abrindo ? (
        <Button size="sm" onClick={() => setAbrindo(true)}>
          <Plus className="h-4 w-4" /> Novo perfil
        </Button>
      ) : (
        <div className="space-y-2 rounded-card border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Nome do perfil" value={nome} placeholder="ex.: Supervisor Regional" onChange={(e) => setNome(e.target.value)} />
            <Select
              label="Comporta-se como"
              value={base}
              onValueChange={setBase}
              placeholder="Escolha o perfil base…"
              hint="De quem ele herda as regras de negócio."
              options={bases}
            />
          </div>
          {erro && <Banner tone="danger" title={erro} />}
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={criar}>
              <Plus className="h-4 w-4" /> Criar perfil
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAbrindo(false); setErro(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {perfis.length > 0 && (
        <div className="divide-y divide-line rounded-card border border-line">
          {perfis.map((p) => (
            <LinhaDePerfil key={p.id} perfil={p} bases={bases} onChange={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaDePerfil({ perfil, bases, onChange }: { perfil: PerfilRow; bases: Base[]; onChange: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(perfil.name);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(body: Record<string, unknown>) {
    setBusy(true);
    setErro(null);
    const r = await postPerfis(body);
    setBusy(false);
    if (!r.ok) {
      setErro(r.error ?? 'Falha');
      return false;
    }
    onChange();
    return true;
  }

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        {editando ? (
          <>
            <div className="min-w-0 flex-1">
              <Input aria-label={`Novo nome de ${perfil.name}`} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <IconButton
              aria-label="Salvar nome"
              disabled={busy}
              onClick={async () => {
                if (await executar({ action: 'rename', id: perfil.id, name: nome })) setEditando(false);
              }}
            >
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton variant="ghost" aria-label="Cancelar" onClick={() => { setNome(perfil.name); setEditando(false); setErro(null); }}>
              <X className="h-4 w-4" />
            </IconButton>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{perfil.name}</span>
            {!perfil.active && <StatusBadge tone="neutral">Desativado</StatusBadge>}
            <span className="shrink-0 text-xs text-ink-500">
              {perfil.usuarios} usuário(s)
              {perfil.ajustes > 0 && ` · ${perfil.ajustes} ajuste(s) na matriz`}
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => executar({ action: 'toggle', id: perfil.id, active: !perfil.active })}>
              {perfil.active ? 'Desativar' : 'Reativar'}
            </Button>
            <IconButton size="sm" variant="ghost" aria-label={`Renomear ${perfil.name}`} onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              size="sm"
              variant="danger"
              aria-label={`Excluir ${perfil.name}`}
              disabled={busy}
              onClick={() => {
                if (confirm(`Excluir o perfil "${perfil.name}"? Os ajustes de matriz dele são apagados junto.`)) executar({ action: 'delete', id: perfil.id });
              }}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
      </div>

      {!editando && (
        <div className="mt-2 max-w-xs">
          <Select
            label="Comporta-se como"
            size="sm"
            value={perfil.baseRole}
            disabled={busy}
            onValueChange={(v) => executar({ action: 'setBase', id: perfil.id, baseRole: v })}
            hint={perfil.usuarios > 0 ? `Trocar aqui muda as regras de negócio de ${perfil.usuarios} usuário(s).` : undefined}
            options={bases}
          />
        </div>
      )}

      {erro && <p className="mt-1 text-xs font-medium text-danger">{erro}</p>}
    </div>
  );
}
