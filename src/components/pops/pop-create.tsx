'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PopCreate({ units }: { units: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [sector, setSector] = useState('');
  const [text, setText] = useState('');
  const [videos, setVideos] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setUnitIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function submit() {
    if (!title.trim() || unitIds.length === 0) { setMsg('Informe título e ao menos uma unidade.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const videoList = videos.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean);
      const res = await fetch('/api/pops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, sector, text, videos: videoList, unitIds }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      setTitle(''); setCategory(''); setSector(''); setText(''); setVideos(''); setUnitIds([]); setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)} variant="gold" className="w-full"><Plus className="h-5 w-5" /> Novo POP</Button>;
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Novo POP (Admin)</h2>
      <div className="space-y-2">
        <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Setor/Função/Equipamento" /></div>
          <div><Label>Setor</Label><Input value={sector} onChange={(e) => setSector(e.target.value)} /></div>
        </div>
        <div>
          <Label>Conteúdo</Label>
          <textarea rows={4} className="w-full rounded-lg border-2 border-input bg-background p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <Label>Vídeos do YouTube (treinamento) — um link por linha</Label>
          <textarea rows={2} className="w-full rounded-lg border-2 border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={videos} onChange={(e) => setVideos(e.target.value)} placeholder="https://youtu.be/...  ou  https://www.youtube.com/watch?v=..." />
          <p className="mt-1 text-xs text-muted-foreground">O gerente assiste ao vídeo direto no POP.</p>
        </div>
        <div>
          <Label>Unidades</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {units.map((u) => (
              <button key={u.id} type="button" onClick={() => toggle(u.id)} className={unitIds.includes(u.id) ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm'}>{u.name}</button>
            ))}
          </div>
        </div>
        {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">Publicar</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
