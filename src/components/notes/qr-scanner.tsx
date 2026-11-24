'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { chaveConfere } from '@/lib/notes/chave';
import { RESTRICOES_DA_CAMERA, dicasDoLeitor, tamanhoDoQuadro, INTERVALO_DA_LEITURA_MS } from '@/lib/notes/leitura-codigo';

/**
 * Extrai a chave de 44 dígitos do conteúdo do QR/código de barras da NFC-e/NFe.
 * v1.206.0: só devolve chave que CONFERE (dígito verificador). Leitura torta do
 * código de barras devolve null — e o leitor segue procurando no próximo quadro,
 * em vez de preencher a nota com número e CNPJ errados.
 */
export function extractChave(text: string): string | null {
  const c = candidataDaChave(text);
  return c && chaveConfere(c) ? c : null;
}

function candidataDaChave(text: string): string | null {
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

// Formatos aceitos pelo leitor nativo; os da biblioteca moram em leitura-codigo.ts.
const NATIVE_FORMATS = ['qr_code', 'code_128', 'code_39', 'itf', 'ean_13', 'codabar'];

/**
 * Botão + overlay que abre a câmera do celular e lê QR code OU código de barras.
 * Usa a BarcodeDetector nativa (Android/Chrome) e cai para @zxing/browser
 * (iOS/Safari). Requer HTTPS.
 *
 * O que ele FAZ com a leitura é do chamador: por padrão extrai a chave de 44
 * dígitos da nota (o uso original), mas os Pedidos Internos precisam do código
 * de barras CRU do produto. Generalizado com `parse` em vez de duplicar a
 * máquina de câmera — que é a parte difícil e a que mais varia entre aparelhos.
 */
export function QrScanner({
  onResult,
  parse = extractChave,
  label = 'Escanear',
  ajuda = <>Aponte para o <strong>QR code</strong> ou o <strong>código de barras</strong> da nota. Aproxime até o código ocupar a largura da moldura.</>,
}: {
  onResult: (valor: string) => void;
  /** Devolve o que interessa da leitura, ou null para continuar procurando. */
  parse?: (texto: string) => string | null;
  label?: string;
  ajuda?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const esperaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* O efeito de câmera depende só de `open`. Sem o ref, um chamador que
     define `parse` inline recriaria a função a cada render e reabriria a
     câmera no meio da leitura. */
  const parseRef = useRef(parse);
  parseRef.current = parse;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    let detector: Detector | null = null;
    let zxing: BrowserMultiFormatReader | null = null;

    async function start() {
      try {
        /* v1.223.1 — pede resolução alta: em 640×480 (o padrão) o código de
           barras da DANFE não tem pixel suficiente por barra. Se o aparelho
           recusar o pedido, abre como antes. */
        let stream: MediaStream;
        try { stream = await navigator.mediaDevices.getUserMedia({ video: RESTRICOES_DA_CAMERA, audio: false }); }
        catch { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
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
          zxing = new BrowserMultiFormatReader(dicasDoLeitor());
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
                const q = tamanhoDoQuadro(v.videoWidth, v.videoHeight);
                canvas.width = q.largura; canvas.height = q.altura;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  try { text = zxing.decodeFromCanvas(canvas).getText(); } catch { /* nada neste frame */ }
                }
              }
            } catch { /* ignora frame inválido */ }
            if (text) {
              const valor = parseRef.current(text);
              if (valor) { finish(); onResult(valor); return; }
            }
          }
          proximo();
        };
        /* A varredura do quadro inteiro pela biblioteca é pesada: um respiro
           entre as tentativas mantém a imagem da câmera fluida. */
        const proximo = () => {
          if (cancelled) return;
          if (zxing) esperaRef.current = setTimeout(() => { rafRef.current = requestAnimationFrame(tick); }, INTERVALO_DA_LEITURA_MS);
          else rafRef.current = requestAnimationFrame(tick);
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
    if (esperaRef.current) { clearTimeout(esperaRef.current); esperaRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setError(null); setOpen(true); }}>
        <Camera className="h-4 w-4" /> {label}
      </Button>

      {open && (
        <div className="sgo-on-dark fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="w-full" />
            <div className="pointer-events-none absolute inset-x-6 inset-y-16 rounded-lg border-2 border-white/80" />
          </div>
          <p className="mt-3 text-center text-sm text-ink-900">{ajuda}</p>
          {error && <p className="mt-2 text-center text-sm font-medium text-danger">{error}</p>}
          <Button type="button" variant="outline" className="mt-4" onClick={() => { cleanup(); setOpen(false); }}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
      )}
    </>
  );
}
