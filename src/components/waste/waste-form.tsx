'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Save, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Banner } from '@/components/ui/ds/banner';
import { Plus, X } from 'lucide-react';
import { GRUPOS, LABEL_TOTAL_GERAL, totaisDoDia, tipoPorCodigo, TURNO_LABEL } from '@/lib/waste/tipos';

interface Category {
  id: string;
  code?: string;
  name: string;
  measure?: 'kg' | 'un';
}
interface SubItem { name: string; qty: string }

const fmtKg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;

/**
 * Rótulo humanizado do procedimento — é o que aparece no aviso de foto faltando.
 * Usa o name da categoria, não o typeCode, para ficar igual ao que o gerente vê.
 */
function labelDoProcedimento(categories: Category[], typeCode: string) {
  return categories.find((c) => c.code === typeCode)?.name ?? typeCode;
}

export function WasteForm({
  unitId,
  operationalDate,
  categories,
  initialKg,
  initialObservation,
  requiresEvidence,
  hasEvidence,
  initialPhotos = {},
}: {
  unitId: string;
  operationalDate: string;
  categories: Category[];
  initialKg: Record<string, number>;
  initialObservation: string | null;
  requiresEvidence: boolean;
  hasEvidence: boolean;
  /** typeCode → path: fotos já salvas no banco para este lançamento. */
  initialPhotos?: Record<string, string>;
}) {
  const router = useRouter();
  const [kg, setKg] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((c) => [c.id, initialKg[c.id]?.toString() ?? ''])),
  );
  const [observation, setObservation] = useState(initialObservation ?? '');
  const [subs, setSubs] = useState<Record<string, SubItem[]>>(
    Object.fromEntries(categories.filter((c) => c.measure === 'un').map((c) => [c.id, [{ name: '', qty: '' }]])),
  );
  const subTotal = (cid: string) => (subs[cid] ?? []).reduce((t, si) => t + (parseInt(si.qty, 10) || 0), 0);

  // Fotos por typeCode (novas nesta sessão).
  const [fotos, setFotos] = useState<Record<string, File>>({});
  // typeCode que está sendo capturado agora (uma câmera por vez).
  const [captureCode, setCaptureCode] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'alert'; text: string } | null>(null);

  // Códigos fixos com kg > 0 neste lançamento — cada um exige foto.
  const codigosComPeso = categories
    .filter((c) => c.code && (parseFloat((kg[c.id] || '0').replace(',', '.')) || 0) > 0)
    .map((c) => c.code as string);

  // Foto satisfeita: nova captura OU já salva no banco.
  const temFoto = (code: string) => code in fotos || code in initialPhotos;

  function abrirCamera(code: string) {
    setCaptureCode(code);
    // Limpa o value para permitir capturar a mesma foto duas vezes.
    if (fileRef.current) fileRef.current.value = '';
    fileRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && captureCode) {
      setFotos((prev) => ({ ...prev, [captureCode]: f }));
    }
    setCaptureCode(null);
    e.target.value = '';
  }

  async function save() {
    setMsg(null);

    // Valida: cada código com peso > 0 precisa de foto.
    const semFoto = codigosComPeso.filter((c) => !temFoto(c));
    if (semFoto.length > 0) {
      const primeiro = semFoto[0];
      setMsg({
        type: 'err',
        text: `É necessário tirar a foto da ${labelDoProcedimento(categories, primeiro)} para concluir o lançamento.`,
      });
      return;
    }

    setLoading(true);
    try {
      const items = categories.map((c) => {
        if (c.measure === 'un') {
          const list = (subs[c.id] ?? []).filter((si) => si.name.trim() && (parseInt(si.qty, 10) || 0) > 0);
          return { categoryId: c.id, kg: list.reduce((t, si) => t + (parseInt(si.qty, 10) || 0), 0), subItems: list.map((si) => ({ name: si.name.trim(), qty: parseInt(si.qty, 10) || 0 })) };
        }
        return { categoryId: c.id, kg: parseFloat((kg[c.id] || '0').replace(',', '.')) || 0 };
      });

      // Sempre multipart para incluir as fotos de procedimento.
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('operationalDate', operationalDate);
      fd.append('observation', observation);
      fd.append('items', JSON.stringify(items));
      for (const [code, file] of Object.entries(fotos)) {
        fd.append(`evidence_${code}`, file);
      }

      const res = await fetch('/api/waste', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? 'Não foi possível salvar' });
        return;
      }
      if (data.alerts?.length) {
        const a = data.alerts
          .map((x: { categoryName: string; increasePct: number }) => `${x.categoryName} +${x.increasePct}%`)
          .join(', ');
        setMsg({ type: 'alert', text: `Salvo. Alerta: ${a} acima da média de 7 dias.` });
      } else {
        setMsg({ type: 'ok', text: 'Lançamento salvo e tarefa concluída ✓' });
      }
      setFotos({});
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: 'Falha de conexão' });
    } finally {
      setLoading(false);
    }
  }

  const totais = totaisDoDia(
    Object.fromEntries(
      categories
        .filter((c) => c.code)
        .map((c) => [c.code as string, parseFloat((kg[c.id] || '0').replace(',', '.')) || 0]),
    ),
  );
  const temTipoFixo = categories.some((c) => c.code && totais.porCodigo[c.code] !== undefined);

  const kgCats = categories.filter((c) => c.measure !== 'un');
  const unCats = categories.filter((c) => c.measure === 'un');

  return (
    <div className="space-y-6">
      {kgCats.length > 0 && (
        <section>
          <h3 className="sgo-type-11 mb-2 text-ink-500">Pesagem (kg)</h3>
          {(['ALMOCO', 'JANTAR', 'OUTROS'] as const).map((turno) => {
            const doTurno = kgCats.filter((c) => (tipoPorCodigo(c.code ?? '')?.turno ?? 'OUTROS') === turno);
            if (doTurno.length === 0) return null;
            return (
              <div key={turno} className="mb-3">
                <p className="mb-1.5 sgo-type-13 font-semibold text-brand">{turno === 'OUTROS' ? 'Outros' : TURNO_LABEL[turno]}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {doTurno.map((c) => {
                    const valor = parseFloat((kg[c.id] || '0').replace(',', '.')) || 0;
                    const code = c.code;
                    const precisaFoto = code && valor > 0;
                    const fotoNova = code ? fotos[code] : undefined;
                    const fotoExistente = code && code in initialPhotos;
                    const fotoOk = precisaFoto && temFoto(code!);
                    return (
                      <div key={c.id} className="space-y-1">
                        <Input
                          label={c.name}
                          inputMode="decimal"
                          placeholder="0,000"
                          className="text-right tabular-nums"
                          value={kg[c.id] ?? ''}
                          onChange={(e) => setKg((s) => ({ ...s, [c.id]: e.target.value }))}
                        />
                        {/* Foto obrigatória quando há peso. Aparece logo abaixo do campo. */}
                        {precisaFoto && code && (
                          <div className={`rounded-lg border px-3 py-2 ${fotoOk ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}`}>
                            {fotoNova ? (
                              <div className="flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={URL.createObjectURL(fotoNova)} alt="Preview" className="h-10 w-10 rounded object-cover" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-success">Foto capturada</p>
                                  <p className="text-[11px] text-ink-500">{fotoNova.name}</p>
                                </div>
                                <IconButton size="sm" variant="ghost" aria-label="Refazer foto" onClick={() => abrirCamera(code)}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                            ) : fotoExistente ? (
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                  <p className="text-xs text-ink-700">Foto já registrada</p>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => abrirCamera(code)}>
                                  <Camera className="h-3.5 w-3.5" /> Substituir
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-warning">Foto obrigatória do procedimento</p>
                                <Button size="sm" variant="ghost" onClick={() => abrirCamera(code)}>
                                  <Camera className="h-4 w-4" /> Tirar foto
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {temTipoFixo && (
            <div className="mt-3 rounded-card border-2 border-brand/30 bg-brand/5 p-3">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <span className="text-[11px] text-ink-700">{GRUPOS[0].label}</span>
                  <span className="block text-lg font-bold tabular-nums text-ink-900">{fmtKg(totais.sobraLimpa)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <span className="text-[11px] text-ink-700">{GRUPOS[1].label}</span>
                  <span className="block text-lg font-bold tabular-nums text-ink-900">{fmtKg(totais.sobraProducao)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <span className="text-[11px] font-semibold text-brand">{LABEL_TOTAL_GERAL}</span>
                  <span className="block text-xl font-bold tabular-nums text-brand">{fmtKg(totais.geral)}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {unCats.length > 0 && (
        <section>
          <h3 className="sgo-type-11 mb-2 text-ink-500">Contagem (unidades)</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {unCats.map((c) => (
              <div key={c.id} className="rounded-card border border-line p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-ink-700">{c.name}</span>
                  <span className="text-xs font-semibold tabular-nums text-ink-900">Total: {subTotal(c.id)} un</span>
                </div>
                <div className="space-y-2">
                  {(subs[c.id] ?? []).map((si, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        aria-label={`Produto ${i + 1} de ${c.name}`}
                        value={si.name}
                        onChange={(e) => setSubs((s) => ({ ...s, [c.id]: s[c.id].map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))}
                        placeholder="Produto (ex.: coxinha)"
                        className="flex-1"
                      />
                      <Input
                        aria-label={`Quantidade do produto ${i + 1} de ${c.name}`}
                        inputMode="numeric"
                        value={si.qty}
                        onChange={(e) => setSubs((s) => ({ ...s, [c.id]: s[c.id].map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)) }))}
                        placeholder="qtd"
                        className="w-20 text-right tabular-nums"
                      />
                      <IconButton
                        variant="danger"
                        aria-label={`Remover produto ${i + 1}`}
                        onClick={() => setSubs((s) => ({ ...s, [c.id]: s[c.id].length > 1 ? s[c.id].filter((_, j) => j !== i) : s[c.id] }))}
                      >
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setSubs((s) => ({ ...s, [c.id]: [...(s[c.id] ?? []), { name: '', qty: '' }] }))}
                >
                  <Plus className="h-4 w-4" /> Adicionar produto
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Input label="Observação (opcional)" value={observation} onChange={(e) => setObservation(e.target.value)} />

      {msg && (
        <Banner
          tone={msg.type === 'ok' ? 'success' : msg.type === 'alert' ? 'warning' : 'danger'}
          title={msg.text}
        />
      )}

      <Button onClick={save} loading={loading} size="lg" className="w-full">
        <Save className="h-5 w-5" /> {loading ? 'Salvando…' : 'Salvar lançamento'}
      </Button>

      {/* Input oculto — somente câmera, sem galeria (capture="environment"). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFileChange}
      />
    </div>
  );
}
