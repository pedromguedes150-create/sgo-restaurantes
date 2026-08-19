'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Camera, Copy, Flashlight, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { candidateNumbers } from '@/lib/commands/barcode';

/**
 * Diagnóstico do leitor de código de barras da comanda.
 *
 * Existe para responder três perguntas que NÃO dão para responder de fora do
 * aparelho — e cujo palpite errado faria a conferência falhar em operação:
 *
 *  1. Qual motor de leitura o celular usa? A `BarcodeDetector` nativa existe no
 *     Android/Chrome e NÃO existe no Safari do iPhone, onde entra o @zxing.
 *  2. Quantos códigos o motor entrega POR QUADRO? A leitura nativa devolve uma
 *     lista (dá para ler várias comandas espalhadas na mesa de uma vez); o
 *     @zxing devolve um por quadro. Isso decide se conferir 605 comandas é
 *     viável ou não.
 *  3. O que está REALMENTE codificado nas barras? A etiqueta mostra "0346"
 *     impresso, mas o código pode trazer o número puro, com zeros à esquerda,
 *     com prefixo da unidade, ou um EAN-13 com dígito verificador.
 *
 * Nada é enviado para o servidor: a leitura fica na tela e o botão copia um
 * resumo em texto para colar na conversa.
 */

const NATIVE_FORMATS = ['qr_code', 'code_128', 'code_39', 'itf', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'codabar', 'data_matrix', 'pdf417'];
const ZXING_FORMATS = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODABAR];

interface Leitura {
  raw: string;
  formato: string;
  vezes: number;
  digitos: number;
  palpites: number[];
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string; format?: string }[]> };
type ComZoom = MediaTrackCapabilities & { zoom?: { min: number; max: number; step: number }; torch?: boolean };

/** Bipe curto por Web Audio — não depende de arquivo de som. */
function useBipe() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback(() => {
    try {
      type ComWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
      const AC = window.AudioContext ?? (window as ComWebkit).webkitAudioContext;
      if (!AC) return;
      const ctx = (ctxRef.current ??= new AC());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1180;
      gain.gain.value = 0.09;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch { /* som é conforto, não requisito */ }
  }, []);
}

export function BarcodeDiagnostics() {
  const [ligado, setLigado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [motor, setMotor] = useState<'nativo' | 'zxing' | null>(null);
  const [formatosSuportados, setFormatosSuportados] = useState<string[] | null>(null);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [quadros, setQuadros] = useState(0);
  const [maxPorQuadro, setMaxPorQuadro] = useState(0);
  const [temLanterna, setTemLanterna] = useState(false);
  const [lanterna, setLanterna] = useState(false);
  const [resolucao, setResolucao] = useState<string>('—');
  const [copiado, setCopiado] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bipe = useBipe();

  /* Ambiente: dá para saber ANTES de abrir a câmera. */
  const [ambiente, setAmbiente] = useState<{ nativa: boolean; seguro: boolean; navegador: string }>({ nativa: false, seguro: false, navegador: '' });
  useEffect(() => {
    const w = window as unknown as { BarcodeDetector?: { getSupportedFormats?: () => Promise<string[]> } };
    setAmbiente({
      nativa: typeof w.BarcodeDetector !== 'undefined',
      seguro: window.isSecureContext,
      navegador: navigator.userAgent.slice(0, 120),
    });
    w.BarcodeDetector?.getSupportedFormats?.().then(setFormatosSuportados).catch(() => setFormatosSuportados(null));
  }, []);

  const registrar = useCallback((raw: string, formato: string) => {
    setLeituras((atual) => {
      const i = atual.findIndex((l) => l.raw === raw);
      if (i >= 0) {
        const copia = [...atual];
        copia[i] = { ...copia[i], vezes: copia[i].vezes + 1 };
        return copia;
      }
      bipe();
      navigator.vibrate?.(60);
      const digitos = (raw.match(/\d/g) ?? []).length;
      return [{ raw, formato, vezes: 1, digitos, palpites: candidateNumbers(raw).slice(0, 6) }, ...atual].slice(0, 60);
    });
  }, [bipe]);

  useEffect(() => {
    if (!ligado) return;
    let cancelado = false;
    let detector: Detector | null = null;
    let zxing: BrowserMultiFormatReader | null = null;

    async function comecar() {
      try {
        /* Resolução alta importa: a etiqueta da comanda é pequena e as barras
           finas somem num quadro de 640px. */
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setResolucao(`${video.videoWidth}×${video.videoHeight}`);

        const trilha = stream.getVideoTracks()[0];
        const caps = (trilha?.getCapabilities?.() ?? {}) as ComZoom;
        setTemLanterna(Boolean(caps.torch));

        const W = window as unknown as { BarcodeDetector?: new (o?: { formats: string[] }) => Detector };
        if (W.BarcodeDetector) {
          try { detector = new W.BarcodeDetector({ formats: NATIVE_FORMATS }); }
          catch { try { detector = new W.BarcodeDetector(); } catch { detector = null; } }
        }
        if (detector) setMotor('nativo');
        else {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
          hints.set(DecodeHintType.TRY_HARDER, true);
          zxing = new BrowserMultiFormatReader(hints);
          setMotor('zxing');
        }

        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;

        const tick = async () => {
          if (cancelado) return;
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            setQuadros((n) => n + 1);
            try {
              if (detector) {
                /* TODOS os códigos do quadro, não só o primeiro — é o que
                   permitiria ler várias comandas espalhadas de uma vez. */
                const codes = await detector.detect(v);
                if (codes?.length) {
                  setMaxPorQuadro((m) => Math.max(m, codes.length));
                  for (const c of codes) registrar(String(c.rawValue ?? ''), String(c.format ?? 'nativo'));
                }
              } else if (zxing) {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  try {
                    const res = zxing.decodeFromCanvas(canvas);
                    setMaxPorQuadro((m) => Math.max(m, 1));
                    registrar(res.getText(), BarcodeFormat[res.getBarcodeFormat()] ?? 'zxing');
                  } catch { /* nenhum código neste quadro */ }
                }
              }
            } catch { /* quadro inválido */ }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelado) setErro('Não foi possível abrir a câmera. Confira a permissão do navegador e se o endereço está em HTTPS.');
      }
    }

    comecar();
    return () => {
      cancelado = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [ligado, registrar]);

  async function alternarLanterna() {
    const trilha = streamRef.current?.getVideoTracks()[0];
    if (!trilha) return;
    const novo = !lanterna;
    try {
      // `torch` não está na tipagem padrão do DOM, mas é o que Android/Chrome aceita.
      await trilha.applyConstraints({ advanced: [{ torch: novo }] } as unknown as MediaTrackConstraints);
      setLanterna(novo);
    } catch { setTemLanterna(false); }
  }

  const resumo = [
    '--- DIAGNÓSTICO DO LEITOR (SGO) ---',
    `Motor: ${motor ?? '(não iniciado)'}`,
    `BarcodeDetector nativa: ${ambiente.nativa ? 'SIM' : 'NÃO'}`,
    `Formatos suportados pela nativa: ${formatosSuportados ? formatosSuportados.join(', ') : '(não informado)'}`,
    `Contexto seguro (HTTPS): ${ambiente.seguro ? 'sim' : 'NÃO'}`,
    `Resolução da câmera: ${resolucao}`,
    `Quadros processados: ${quadros}`,
    `Máximo de códigos num único quadro: ${maxPorQuadro}`,
    `Navegador: ${ambiente.navegador}`,
    `Leituras únicas: ${leituras.length}`,
    ...leituras.map((l) => `  • raw="${l.raw}" | formato=${l.formato} | ${l.raw.length} caracteres, ${l.digitos} dígitos | vezes=${l.vezes} | palpites=[${l.palpites.join(', ')}]`),
    '--- fim ---',
  ].join('\n');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch { setErro('Não consegui copiar. Selecione o texto do quadro abaixo à mão.'); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="sgo-type-11 font-semibold text-ink-500">Antes de abrir a câmera</p>
        <div className="mt-2 space-y-1 text-sm">
          <p><strong>Leitor nativo do aparelho:</strong> {ambiente.nativa ? 'disponível (leitura rápida, vários códigos por quadro)' : 'ausente — vai usar o leitor alternativo, um código por vez'}</p>
          <p><strong>Endereço seguro (HTTPS):</strong> {ambiente.seguro ? 'sim' : 'não — a câmera não abre sem HTTPS'}</p>
          {formatosSuportados && <p className="text-ink-500">Formatos: {formatosSuportados.join(', ')}</p>}
        </div>
      </div>

      {!ligado && (
        <Button onClick={() => { setErro(null); setLigado(true); }} className="w-full" variant="gold">
          <Camera className="h-4 w-4" /> Abrir câmera e bipar uma comanda
        </Button>
      )}

      {ligado && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-card border border-line bg-ink-900">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="pointer-events-none absolute inset-x-8 inset-y-1/3 rounded-lg border-2 border-surface/80" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0 rounded-card border border-line bg-surface p-4">
              <p className="sgo-type-11 font-semibold text-ink-500">motor</p>
              <p className="sgo-type-24 mt-1 font-semibold text-ink-900">{motor === 'nativo' ? 'nativo' : motor === 'zxing' ? 'alternativo' : '—'}</p>
            </div>
            <div className="min-w-0 rounded-card border border-line bg-surface p-4">
              <p className="sgo-type-11 font-semibold text-ink-500">por quadro</p>
              <p className="sgo-type-24 mt-1 font-semibold tabular-nums text-ink-900">{maxPorQuadro}</p>
            </div>
            <div className="min-w-0 rounded-card border border-line bg-surface p-4">
              <p className="sgo-type-11 font-semibold text-ink-500">lidas</p>
              <p className="sgo-type-24 mt-1 font-semibold tabular-nums text-ink-900">{leituras.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {temLanterna && (
              <Button size="sm" variant="outline" onClick={alternarLanterna}>
                <Flashlight className="h-4 w-4" /> {lanterna ? 'Apagar lanterna' : 'Acender lanterna'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setLeituras([]); setMaxPorQuadro(0); setQuadros(0); }}>
              <Trash2 className="h-4 w-4" /> Limpar leituras
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLigado(false)}>
              <X className="h-4 w-4" /> Fechar câmera
            </Button>
          </div>

          <p className="text-sm text-ink-500">
            Aponte para o código de barras da comanda. Cada leitura nova dá um bipe. Para testar a leitura múltipla,
            espalhe várias comandas na mesa e enquadre mais de uma ao mesmo tempo — o número em <strong>por quadro</strong> mostra
            quantas ele pegou de uma vez.
          </p>
        </div>
      )}

      {erro && <p className="text-sm font-semibold text-danger">{erro}</p>}

      {leituras.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="sgo-type-11 font-semibold text-ink-500">Leituras</p>
          <ul className="mt-2 space-y-2">
            {leituras.map((l) => (
              <li key={l.raw} className="border-b border-line pb-2 last:border-b-0 last:pb-0">
                <p className="break-all text-sm font-semibold text-ink-900">{l.raw || '(vazio)'}</p>
                <p className="text-xs text-ink-500">
                  {l.formato} · {l.raw.length} caracteres · {l.digitos} dígitos · lido {l.vezes}×
                </p>
                <p className="text-xs text-ink-500">O sistema tentaria: {l.palpites.length ? l.palpites.join(', ') : '(nenhum número)'}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="sgo-type-11 font-semibold text-ink-500">Resumo para copiar</p>
          <Button size="sm" variant="outline" onClick={copiar}>
            <Copy className="h-4 w-4" /> {copiado ? 'Copiado' : 'Copiar diagnóstico'}
          </Button>
        </div>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control bg-sunken p-3 text-xs text-ink-900">{resumo}</pre>
      </div>
    </div>
  );
}
