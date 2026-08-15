'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
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

  return (
    <div className="space-y-4">
      {units.length > 1 && (
        <Select
          label="Unidade"
          size="lg"
          value={unitId}
          onValueChange={setUnitId}
          options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
        />
      )}

      <Select
        label="Tipo"
        size="lg"
        placeholder="Selecione…"
        value={typeId}
        onValueChange={(v) => { setTypeId(v); setCategoryId(''); }}
        options={types.map((t) => ({ value: t.id, label: t.name }))}
      />

      <Select
        label="Categoria"
        size="lg"
        placeholder={typeId ? 'Selecione…' : 'Escolha o tipo primeiro'}
        disabled={!typeId}
        value={categoryId}
        onValueChange={setCategoryId}
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
      />

      <Select
        label="Gravidade"
        size="lg"
        value={gravity}
        onValueChange={setGravity}
        options={GRAVITY_ORDER.map((g) => ({ value: g, label: GRAVITY_META[g].label }))}
      />

      <div className="space-y-1.5">
        <Label htmlFor="cli">Nome do cliente (opcional)</Label>
        <Input id="cli" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Descrição</Label>
        <textarea
          id="desc"
          rows={4}
          className="w-full rounded-lg border-2 border-line-strong bg-sgo-surface p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgo-brand"
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

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}

      <Button onClick={submit} disabled={loading} size="lg" className="w-full">
        {loading ? 'Registrando…' : (<><Save className="h-5 w-5" /> Registrar ocorrência</>)}
      </Button>
    </div>
  );
}
