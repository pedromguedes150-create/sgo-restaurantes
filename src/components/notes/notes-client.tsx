'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Save, Banknote, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { QrScanner } from '@/components/notes/qr-scanner';
import { formatBRL } from '@/lib/utils';
import { parseChaveAcesso } from '@/lib/notes/chave';

interface Unit { id: string; name: string }
interface Supplier { id: string; name: string; cnpj: string | null }
export interface NoteDTO {
  id: string; unit: string; supplier: string; value: number;
  status: 'RECEIVED' | 'PAID' | 'PROBLEM'; number: string | null; problemNote: string | null;
}
const ST: Record<NoteDTO['status'], { label: string; tone: StatusTone }> = {
  RECEIVED: { label: 'Recebida', tone: 'medium' },
  PAID: { label: 'Paga', tone: 'success' },
  PROBLEM: { label: 'Com problema', tone: 'critical' },
};

export function NotesClient({ units, notes, suppliers = [], isAdmin = false }: { units: Unit[]; notes: NoteDTO[]; suppliers?: Supplier[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<'nova' | 'lista'>('lista');
  const [busy, setBusy] = useState(false);

  async function status(id: string, st: 'PAID' | 'PROBLEM') {
    let problemNote: string | undefined;
    if (st === 'PROBLEM') { const m = prompt('Descreva o problema:'); if (!m) return; problemNote = m; }
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: st, problemNote }) });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['lista', 'nova'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>
            {t === 'lista' ? 'Notas' : 'Registrar nota'}
          </button>
        ))}
      </div>

      {tab === 'nova' ? (
        <NewNote units={units} suppliers={suppliers} onDone={() => { setTab('lista'); router.refresh(); }} />
      ) : (
        <div className="space-y-2">
          {notes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma nota registrada.</p>}
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand">{n.supplier}</p>
                <StatusBadge tone={ST[n.status].tone}>{ST[n.status].label}</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{n.unit} · {formatBRL(n.value)}{n.number ? ` · nº ${n.number}` : ''}</p>
              {n.problemNote && <p className="mt-1 text-xs text-critical">Problema: {n.problemNote}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {n.status === 'RECEIVED' && (
                  <>
                    <Button size="sm" variant="gold" disabled={busy} onClick={() => status(n.id, 'PAID')}><Banknote className="h-4 w-4" /> Paga</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => status(n.id, 'PROBLEM')}><AlertTriangle className="h-4 w-4" /> Problema</Button>
                  </>
                )}
                {isAdmin && <DeleteOpButton entity="note" id={n.id} label={`a nota de ${n.supplier}`} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewNote({ units, suppliers, onDone }: { units: Unit[]; suppliers: Supplier[]; onDone: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [accessKey, setAccessKey] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [productType, setProductType] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onKey(v: string) {
    setAccessKey(v);
    const parsed = parseChaveAcesso(v);
    if (parsed.valid) {
      if (parsed.cnpjFormatted) setSupplierCnpj(parsed.cnpjFormatted);
      if (parsed.number) setNumber(parsed.number);
      if (parsed.issueDate) setIssueDate(parsed.issueDate.toISOString().slice(0, 10));
      setPrefilled(true);
    } else setPrefilled(false);
  }

  async function submit() {
    setErr(null);
    const v = parseFloat((totalValue || '0').replace('.', '').replace(',', '.')) || parseFloat(totalValue);
    if (!unitId || !supplierName.trim() || !v) { setErr('Preencha unidade, fornecedor e valor.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, source: accessKey ? 'QRCODE' : 'MANUAL', accessKey, supplierId, supplierName, supplierCnpj, number, issueDate, dueDate, totalValue: v, productType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  const hl = prefilled ? 'border-medium bg-medium/5' : '';
  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <div><Label>Unidade</Label>
          <select className="h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <Label htmlFor="key"><ScanLine className="mr-1 inline h-4 w-4" /> Chave de acesso (44 dígitos — QR/DANFE)</Label>
        <div className="flex gap-2">
          <Input id="key" inputMode="numeric" value={accessKey} onChange={(e) => onKey(e.target.value)} placeholder="cole, digite ou escaneie" className="flex-1" />
          <QrScanner onResult={(chave) => onKey(chave)} />
        </div>
        {prefilled && <p className="mt-1 text-xs text-[#92600A]">Campos preenchidos pela chave — confira em amarelo.</p>}
      </div>
      {suppliers.length > 0 && (
        <div>
          <Label>Fornecedor cadastrado</Label>
          <select className="h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={supplierId} onChange={(e) => {
            const s = suppliers.find((x) => x.id === e.target.value);
            setSupplierId(e.target.value);
            if (s) { setSupplierName(s.name); if (s.cnpj) setSupplierCnpj(s.cnpj); }
          }}>
            <option value="">— escolher / digitar abaixo —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div><Label>Fornecedor</Label><Input value={supplierName} onChange={(e) => { setSupplierName(e.target.value); setSupplierId(''); }} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>CNPJ</Label><Input className={hl} value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} /></div>
        <div><Label>Número</Label><Input className={hl} value={number} onChange={(e) => setNumber(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Emissão</Label><Input className={hl} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
        <div><Label>Vencimento</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Valor total (R$)</Label><Input inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="0,00" /></div>
        <div><Label>Tipo de produto</Label><Input value={productType} onChange={(e) => setProductType(e.target.value)} /></div>
      </div>
      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Save className="h-5 w-5" /> Confirmar e salvar</Button>
    </div>
  );
}
