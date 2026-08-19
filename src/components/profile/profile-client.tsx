'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfileClient({ name, cpf, email }: { name: string; cpf: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(name);
  const [c, setC] = useState(cpf);
  const [cur, setCur] = useState('');
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, okMsg: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha'); return false; }
      setMsg(okMsg); router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-surface p-3">
        <p className="mb-2 sgo-type-11 font-semibold text-ink-500">Meus dados</p>
        <div className="space-y-2">
          <div><Label className="text-xs">E-mail (login)</Label><Input value={email} disabled className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Nome completo</Label><Input value={n} onChange={(e) => setN(e.target.value)} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">CPF</Label><Input inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} placeholder="000.000.000-00" className="h-10 text-sm" /></div>
          <Button size="sm" disabled={busy} onClick={() => void post({ action: 'update', name: n, cpf: c }, 'Dados salvos ✓')}><Save className="h-4 w-4" /> Salvar dados</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-surface p-3">
        <p className="mb-2 flex items-center gap-1.5 sgo-type-11 font-semibold text-ink-500"><KeyRound className="h-3.5 w-3.5" /> Trocar senha</p>
        <div className="space-y-2">
          <div><Label className="text-xs">Senha atual</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="h-10 text-sm" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Nova senha (mín. 8)</Label><Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} className="h-10 text-sm" /></div>
            <div><Label className="text-xs">Repetir nova senha</Label><Input type="password" value={nova2} onChange={(e) => setNova2(e.target.value)} className="h-10 text-sm" /></div>
          </div>
          <Button size="sm" disabled={busy || !cur || !nova || nova !== nova2} onClick={async () => {
            if (await post({ action: 'password', currentPassword: cur, newPassword: nova }, 'Senha alterada ✓')) { setCur(''); setNova(''); setNova2(''); }
          }}><KeyRound className="h-4 w-4" /> Alterar senha</Button>
          {nova && nova2 && nova !== nova2 && <p className="text-xs text-danger">As senhas não conferem.</p>}
        </div>
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.includes('✓') ? 'text-success' : 'text-danger'}`}>{msg}</p>}
    </div>
  );
}
