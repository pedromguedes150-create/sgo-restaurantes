'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  /** Para onde a ocorrência vai: Geral, Manutenção ou TI. */
  isMaintenance?: boolean;
  isIT?: boolean;
  categories: { id: string; name: string }[];
}

/** O que cada gravidade DISPARA. O gerente escolhia no escuro: os rótulos
 *  "Baixa/Média/Alta/Crítica" não diziam que duas delas acordam gente. */
const GRAVITY_HINT: Record<string, string> = {
  LOW: 'Registro para histórico. Não dispara aviso.',
  MEDIUM: 'Registro para histórico. Não dispara aviso.',
  HIGH: 'Avisa a supervisão na hora.',
  CRITICAL: 'Avisa a supervisão E a diretoria na hora.',
};

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

  const tipo = useMemo(() => types.find((t) => t.id === typeId), [types, typeId]);
  const categories = tipo?.categories ?? [];
  /**
   * Tipo SEM categoria cadastrada não é erro de preenchimento — é o cadastro
   * que está incompleto. Antes o campo abria vazio e o registro era recusado
   * sem dizer por quê (era o caso de "Manutenção e obras"): beco sem saída.
   * Agora o campo desaparece e a ocorrência é registrada sem categoria, o que
   * o banco sempre permitiu.
   */
  const semCategorias = Boolean(tipo) && categories.length === 0;

  /** Para onde vai aparecer — o gerente não tinha como saber que o tipo decide isso. */
  const destino = !tipo ? null : tipo.isMaintenance ? 'Manutenção' : tipo.isIT ? 'TI' : 'Geral';

  const faltando = !unitId
    ? 'a unidade'
    : !typeId
      ? 'o tipo'
      : !categoryId && categories.length > 0
        ? 'a categoria'
        : !description.trim()
          ? 'a descrição'
          : null;

  async function submit() {
    setError(null);
    if (faltando) {
      setError(`Falta preencher ${faltando}.`);
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('typeId', typeId);
      // Sem categoria não manda o campo — o servidor só exige quando o tipo tem.
      if (categoryId) fd.append('categoryId', categoryId);
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
          required
          value={unitId}
          onValueChange={setUnitId}
          options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
        />
      )}

      <Select
        label="Tipo"
        size="lg"
        required
        placeholder="Selecione…"
        hint={destino ? `Aparece na aba ${destino} da lista de ocorrências.` : 'O tipo decide em qual aba a ocorrência aparece.'}
        value={typeId}
        onValueChange={(v) => { setTypeId(v); setCategoryId(''); }}
        options={types.map((t) => ({
          value: t.id,
          label: t.name,
          hint: t.isMaintenance ? 'Manutenção' : t.isIT ? 'TI' : undefined,
        }))}
      />

      {/* Antes de escolher o tipo, o campo aparece DESATIVADO — ensina a ordem.
          Depois de escolher, ou ele traz as categorias daquele tipo, ou some
          (quando o tipo não tem nenhuma). O que não pode voltar a existir é o
          campo aberto e vazio, exigido e impossível: era o beco sem saída. */}
      {(!typeId || categories.length > 0) && (
        <Select
          label="Categoria"
          size="lg"
          required={categories.length > 0}
          disabled={!typeId}
          placeholder={typeId ? 'Selecione…' : 'Escolha o tipo primeiro'}
          hint={
            typeId
              ? 'Serve para detectar reincidência: o mesmo tipo e categoria na mesma unidade em menos de 30 dias vira alerta.'
              : 'As categorias mudam conforme o tipo.'
          }
          value={categoryId}
          onValueChange={setCategoryId}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}

      {semCategorias && (
        <p className="rounded-lg bg-info/10 px-3 py-2 text-xs leading-5 text-ink-700">
          <span className="font-semibold text-ink-900">{tipo?.name}</span> não tem categorias cadastradas,
          então este campo não aparece — pode registrar assim mesmo. Para separar por categoria,
          cadastre em{' '}
          <Link href="/configuracoes/ocorrencias" className="font-semibold text-brand hover:underline">
            Configurações → Ocorrências
          </Link>.
        </p>
      )}

      <Select
        label="Gravidade"
        size="lg"
        required
        hint={GRAVITY_HINT[gravity]}
        value={gravity}
        onValueChange={setGravity}
        options={GRAVITY_ORDER.map((g) => ({
          value: g,
          label: `${GRAVITY_META[g].emoji} ${GRAVITY_META[g].label}`,
          hint: GRAVITY_HINT[g],
        }))}
      />

      <div className="space-y-1.5">
        <Label htmlFor="cli">Nome do cliente (opcional)</Label>
        <Input id="cli" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <p className="text-xs text-ink-500">Preencha se a ocorrência envolveu um cliente específico.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">Descrição</Label>
        <textarea
          id="desc"
          rows={4}
          className="w-full rounded-lg border-2 border-line-strong bg-surface p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="O que aconteceu, onde, e o que já foi feito…"
        />
        <p className="text-xs text-ink-500">
          Quem for encerrar precisa entender o caso sem te ligar: diga o que aconteceu, onde e o que já foi feito.
        </p>
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
        <p className="text-xs text-ink-500">Uma foto costuma resolver mais rápido que um parágrafo.</p>
      </div>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}

      <Button onClick={submit} disabled={loading} size="lg" className="w-full">
        {loading ? 'Registrando…' : (<><Save className="h-5 w-5" /> Registrar ocorrência</>)}
      </Button>
      {/* Diz o que falta ANTES de tentar, em vez de recusar depois do clique. */}
      {faltando && !error && (
        <p className="text-center text-xs text-ink-500">Falta preencher {faltando}.</p>
      )}
    </div>
  );
}
