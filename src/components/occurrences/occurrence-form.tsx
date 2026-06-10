'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GRAVITY_META, GRAVITY_ORDER } from '@/lib/occurrences/labels';

interface UnitOpt {
  id: string;
  name: string;
}
interface TypeOpt {
  id: string;
  name: string;
  categories: { id: string; name: string }[];
}

export function OccurrenceForm({ units, types }: { units: UnitOpt[]; types: TypeOpt[] }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [typeId, setTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [gravity, setGravity] = useState('MEDIUM');
  const [customerName, setCustomerName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => types.find((t) => t.id === typeId)?.categories ?? [], [types, typeId]);

  async function submit() {
    setError(null);
    if (!unitId || !typeId || !categoryId || !description.trim()) {
      setError('Preencha unidade, tipo, categoria e descrição.');
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('typeId', typeId);
      fd.append('categoryId', categoryId);
      fd.append('gravity', gravity);
      fd.append('customerName', customerName);
      fd.append('description', description);
      if (files) for (const f of Array.from(files)) fd.append('attachments', f);

      const res = await fetch('/api/occurrences', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível registrar');
        return;
      }
      router.push('/modulos/ocorrencias');
      router.refresh();
    } catch {
      setError('Falha de conexão');
    } finally {
      setLoading(false);
    }
  }

  const selectClass =
    'flex h-12 w-full rounded-lg border-2 border-input bg-background px-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unidade</Label>
          <select id="unit" className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="type">Tipo</Label>
        <select
          id="type"
          className={selectClass}
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setCategoryId('');
          }}
        >
          <option value="">Selecione…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cat">Categoria</Label>
        <select id="cat" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={!typeId}>
          <option value="">{typeId ? 'Selecione…' : 'Escolha o tipo primeiro'}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="grav">Gravidade</Label>
        <select id="grav" className={selectClass} value={gravity} onChange={(e) => setGravity(e.target.value)}>
          {GRAVITY_ORDER.map((g) => (
            <option key={g} value={g}>
              {GRAVITY_META[g].emoji} {GRAVITY_META[g].label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cli">Nome do cliente (opcional)</Label>
        <Input id="cli" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Descrição</Label>
        <textarea
          id="desc"
          rows={4}
          className="w-full rounded-lg border-2 border-input bg-background p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o que aconteceu…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="att">Anexos (foto/vídeo, opcional)</Label>
        <input
          id="att"
          type="file"
          accept="image/*,video/*"
          multiple
          className="block w-full text-sm"
          onChange={(e) => setFiles(e.target.files)}
        />
      </div>

      {error && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{error}</p>}

      <Button onClick={submit} disabled={loading} size="lg" className="w-full">
        {loading ? 'Registrando…' : (<><Save className="h-5 w-5" /> Registrar ocorrência</>)}
      </Button>
    </div>
  );
}
