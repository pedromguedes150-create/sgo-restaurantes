'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Extrai a chave de 44 dígitos do conteúdo do QR da NFC-e/NFe. */
export function extractChave(text: string): string | null {
  // NFC-e: ...?p=CHAVE|versao|... (a chave é o 1º segmento)
  const p = text.match(/[?&]p=([^|&\s]+)/i);
  if (p) { const d = p[1].replace(/\D/g, ''); if (d.length >= 44) return d.slice(0, 44); }
  // NFe: parâmetro chNFe=CHAVE
  const ch = text.match(/chNFe=(\d{44})/i);
  if (ch) return ch[1];
  // Fallback: sequência isolada de 44 dígitos no texto original
  const run = text.match(/(?<!\d)\d{44}(?!\d)/);
  if (run) return run[0];
  return null;
}

/**
 * Botão + overlay que abre a câmera do celular e lê o QR code da nota.
 * Usa a BarcodeDetector nativa (Android/Chrome) e cai para jsQR (iOS/Safari).
 * Requer HTTPS (já temos). Ao detectar, devolve a chave de 44 dígitos.
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

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (BD) { try { detector = new BD({ formats: ['qr_code'] }); } catch { detector = null; } }

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
                if (codes && codes.length) text = codes[0].rawValue as string;
              } else {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const r = jsQR(img.data, img.width, img.height);
                  if (r) text = r.data;
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
        <Camera className="h-4 w-4" /> Escanear QR
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/80" />
          </div>
          <p className="mt-3 text-center text-sm text-white">Aponte a câmera para o QR code da nota.</p>
          {error && <p className="mt-2 text-center text-sm font-medium text-red-300">{error}</p>}
          <Button type="button" variant="outline" className="mt-4" onClick={() => { cleanup(); setOpen(false); }}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
      )}
    </>
  );
}
