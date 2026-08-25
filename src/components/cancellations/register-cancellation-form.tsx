'use client';

import { useRef, useState } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';

interface Reason { id: string; name: string }
interface Unit { id: string; name: string }

/** "2026-08-25T12:34" — o formato que o input datetime-local espera. */
function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Registro do cancelamento no momento em que ele acontece.
 *
 * A foto é obrigatória e é a razão de a tela existir: o relatório do Teknisa
 * chega no dia seguinte, e a essa altura o cupom já foi para o lixo.
 */
export function RegisterCancellationForm({
  units,
  reasons,
  onDone,
}: {
  units: Unit[];
  reasons: Reason[];
  onDone: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [coupon, setCoupon] = useState('');
  const [value, setValue] = useState('');
  const [quando, setQuando] = useState(agoraLocal);
  const [operator, setOperator] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function limpar() {
    setCoupon(''); setValue(''); setOperator(''); setReasonId(''); setNote('');
    setPhoto(null); setQuando(agoraLocal());
    if (fileRef.current) fileRef.current.value = '';
  }

  async function enviar() {
    setMsg(null);
    if (!photo) { setMsg({ t: 'err', m: 'Tire a foto do cupom — é ela que sustenta o registro.' }); return; }
    if (!coupon.trim()) { setMsg({ t: 'err', m: 'Informe o número do cupom.' }); return; }
    if (!value.trim()) { setMsg({ t: 'err', m: 'Informe o valor cancelado.' }); return; }

    const fd = new FormData();
    fd.set('unitId', unitId);
    fd.set('couponNumber', coupon);
    fd.set('value', value);
    /* Sem fuso na string: o servidor interpreta no relógio de quem registrou,
       que é o relógio da loja. */
    fd.set('canceledAt', new Date(quando).toISOString());
    if (operator.trim()) fd.set('cashOperator', operator);
    if (reasonId) fd.set('reasonId', reasonId);
    if (note.trim()) fd.set('note', note);
    fd.set('photo', photo);

    setBusy(true);
    try {
      const res = await fetch('/api/cancellations/register', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ t: 'err', m: data.error ?? 'Falha ao registrar' }); return; }
      setMsg({
        t: 'ok',
        m: data.juntouAoImportado
          ? `Cupom ${coupon}: foto anexada ao cancelamento que veio do Teknisa ✓`
          : `Cancelamento do cupom ${coupon} registrado ✓`,
      });
      limpar();
      onDone();
    } catch {
      setMsg({ t: 'err', m: 'Falha de conexão' });
    } finally {
      setBusy(false);
    }
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)} size="lg" className="w-full">
        <Camera className="h-5 w-5" /> Registrar cancelamento (com foto)
      </Button>
    );
  }

  return (
    <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="sgo-type-11 font-semibold text-ink-900">Registrar cancelamento</h2>
        <Button size="sm" variant="ghost" onClick={() => { setAberto(false); setMsg(null); }} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {units.length > 1 && (
          <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        )}

        {/* A FOTO PRIMEIRO: é o que só pode ser feito agora, com o cupom na mão.
            Os outros campos podem ser conferidos depois; a foto, não. */}
        <div>
          <Label className="text-xs">Foto do cupom <span className="text-danger">*</span></Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
            aria-label="Foto do cupom cancelado"
          />
          <p className="text-[11px] text-ink-500">
            {photo ? `Foto escolhida: ${photo.name}` : 'Sem a foto o registro não é aceito.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Nº do cupom <span className="text-danger">*</span></Label>
            <Input inputMode="numeric" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="ex.: 44821" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Valor (R$) <span className="text-danger">*</span></Label>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" className="h-9 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Hora do cancelamento</Label>
            <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Operador de caixa</Label>
            <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="opcional" className="h-9 text-sm" />
          </div>
        </div>

        <Select
          label="Motivo"
          placeholder="Selecione…"
          value={reasonId}
          onValueChange={setReasonId}
          options={reasons.map((r) => ({ value: r.id, label: r.name }))}
        />
        <p className="text-[11px] text-ink-500">
          Com o motivo preenchido, o cancelamento já entra justificado e não vira pendência.
        </p>

        <div>
          <Label className="text-xs">Observação</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="o que houve" className="h-9 text-sm" />
        </div>

        {msg && <p className={msg.t === 'ok' ? 'text-sm font-medium text-success' : 'text-sm font-medium text-danger'}>{msg.m}</p>}

        <Button onClick={enviar} disabled={busy} className="w-full">
          <Check className="h-4 w-4" /> {busy ? 'Registrando…' : 'Registrar cancelamento'}
        </Button>
      </div>
    </div>
  );
}
