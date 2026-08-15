'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Extrai a chave de 44 dígitos do conteúdo do QR/código de barras da NFC-e/NFe. */
export function extractChave(text: string): string | null {
  // NFC-e (QR): ...?p=CHAVE|versao|... (a chave é o 1º segmento)
  const p = text.match(/[?&]p=([^|&\s]+)/i);
  if (p) { const d = p[1].replace(/\D/g, ''); if (d.length >= 44) return d.slice(0, 44); }
  // NFe: parâmetro chNFe=CHAVE
  const ch = text.match(/chNFe=(\d{44})/i);
  if (ch) return ch[1];
  // DANFE (código de barras Code-128) ou texto: sequência isolada de 44 dígitos
  const run = text.match(/(?<!\d)\d{44}(?!\d)/);
  if (run) return run[0];
  // Último recurso: se sobrarem exatamente 44 dígitos após limpar tudo
  const only = text.replace(/\D/g, '');
  if (only.length === 44) return only;
  return null;
}

// Formatos aceitos: QR (NFC-e) + 1D comuns em DANFE (Code-128 é o da chave).
const ZXING_FORMATS = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.CODABAR];
const NATIVE_FORMATS = ['qr_code', 'code_128', 'code_39', 'itf', 'ean_13', 'codabar'];

/**
 * Botão + overlay que abre a câmera do celular e lê o QR code OU o código de
 * barras (Code-128 da DANFE) da nota. Usa a BarcodeDetector nativa
 * (Android/Chrome) e cai para @zxing/browser (iOS/Safari). Requer HTTPS.
 * Ao detectar, devolve a chave de 44 dígitos.
 */
export function QrScanner({ onResult }: { onResult: (chave: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    let detector: Detector | null = null;
    let zxing: BrowserMultiFormatReader | null = null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        // Detector nativo (rápido); se ausente/indisponível, usa @zxing.
        const BD = (window as unknown as { BarcodeDetector?: new (o?: { formats: string[] }) => Detector }).BarcodeDetector;
        if (BD) {
          try { detector = new BD({ formats: NATIVE_FORMATS }); }
          catch { try { detector = new BD(); } catch { detector = null; } }
        }
        if (!detector) {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
          zxing = new BrowserMultiFormatReader(hints);
        }

        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            let text: string | null = null;
            try {
              if (detector) {
                const codes = await detector.detect(v);
                if (codes && codes.length) text = codes[0].rawValue;
              } else if (zxing) {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  try { text = zxing.decodeFromCanvas(canvas).getText(); } catch { /* nada neste frame */ }
                }
              }
            } catch { /* ignora frame inválido */ }
            if (text) {
              const chave = extractChave(text);
              if (chave) { finish(); onResult(chave); return; }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
      }
    }

    function finish() { cancelled = true; cleanup(); setOpen(false); }
    start();
    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function cleanup() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setOpen(true); }}>
        <Camera className="h-4 w-4" /> Escanear
      </Button>

      {open && (
        <div className="sgo-on-dark fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="pointer-events-none absolute inset-x-6 inset-y-16 rounded-lg border-2 border-white/80" />
          </div>
          <p className="mt-3 text-center text-sm text-ink-900">Aponte para o <strong>QR code</strong> ou o <strong>código de barras</strong> da nota.</p>
          {error && <p className="mt-2 text-center text-sm font-medium text-danger">{error}</p>}
          <Button type="button" variant="outline" className="mt-4" onClick={() => { cleanup(); setOpen(false); }}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
      )}
    </>
  );
}
