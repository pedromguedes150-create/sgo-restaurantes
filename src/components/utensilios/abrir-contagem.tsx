'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { Input } from '@/components/ui/input';
import { LOCAL_MAX } from '@/lib/utensilios/regras';

async function abrirNoServidor(unitId: string, local: string | undefined) {
  const r = await fetch('/api/utensilios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'abrir', unitId, local }) });
  const b = await r.json().catch(() => ({}));
  return { ok: r.ok, id: b.id as string | undefined, erro: b.error as string | undefined };
}

/** Botão que retoma a contagem em aberto de um local e leva para a folha. */
export function AbrirContagem({ unitId, local, rotulo }: { unitId: string; local?: string; rotulo: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function abrir() {
    setOcupado(true); setErro(null);
    const r = await abrirNoServidor(unitId, local);
    setOcupado(false);
    if (!r.ok || !r.id) { setErro(r.erro ?? 'Não foi possível abrir a contagem.'); return; }
    router.push(`/modulos/inventario-utensilios/${r.id}`);
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void abrir()} loading={ocupado}><ClipboardList className="h-4 w-4" /> {rotulo}</Button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}

const OUTRO = '__outro__';

/**
 * Nova contagem (v1.219.0): escolhe o LOCAL dentro da unidade — Restaurante,
 * Lanchonete, um já usado ali ou outro nome — e abre. Só aparecem os locais
 * que ainda não têm contagem em aberto.
 */
export function NovaContagem({ unitId, locais }: { unitId: string; locais: string[] }) {
  const router = useRouter();
  const [local, setLocal] = useState(locais[0] ?? OUTRO);
  const [outro, setOutro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function abrir() {
    const escolhido = local === OUTRO ? outro.trim() : local;
    if (!escolhido) { setErro('Informe o local da contagem.'); return; }
    setOcupado(true); setErro(null);
    const r = await abrirNoServidor(unitId, escolhido);
    setOcupado(false);
    if (!r.ok || !r.id) { setErro(r.erro ?? 'Não foi possível abrir a contagem.'); return; }
    router.push(`/modulos/inventario-utensilios/${r.id}`);
  }
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="nova-contagem">
      <div className="min-w-[10rem] flex-1 sm:max-w-xs">
        <Select label="Local da nova contagem" value={local} onValueChange={setLocal} options={[...locais.map((l) => ({ value: l, label: l })), { value: OUTRO, label: 'Outro local…' }]} />
      </div>
      {local === OUTRO && (
        <label className="block min-w-[10rem] flex-1 text-xs text-ink-500 sm:max-w-xs">Nome do local
          <Input value={outro} onChange={(e) => setOutro(e.target.value)} maxLength={LOCAL_MAX} placeholder="Ex.: Pizzaria" className="mt-1 h-10 text-sm" />
        </label>
      )}
      <Button size="sm" onClick={() => void abrir()} loading={ocupado}><ClipboardList className="h-4 w-4" /> Iniciar contagem</Button>
      {erro && <span className="w-full text-xs text-danger">{erro}</span>}
    </div>
  );
}
