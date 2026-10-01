'use client';

import * as React from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Sheet } from '@/components/ui/ds/sheet';
import { Banner } from '@/components/ui/ds/banner';
import { compressImage } from '@/lib/image-compress';
import type { RascunhoDaFicha } from '@/lib/preparo/tipos';
import { recortarFoto } from './recorte-foto';

/**
 * IMPORTAR FICHA — passo 1: escolher o arquivo e pedir a leitura. O resultado
 * (rascunho + arquivo-fonte + foto recortada) vai para o formulário de
 * conferência, que é quem publica. Esta tela NÃO grava ficha nenhuma.
 */
export interface ResultadoDaImportacao {
  rascunho: RascunhoDaFicha | null;
  sourceFilePath: string;
  foto: File | null;
  aviso: { tone: 'info' | 'warning' | 'danger'; title: string; description?: string } | null;
}

export function ImportarFicha({ open, onClose, onPronto }: {
  open: boolean;
  onClose: () => void;
  onPronto: (r: ResultadoDaImportacao) => void;
}) {
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [processando, setProcessando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setArquivo(null); setErro(null); setProcessando(false); } }, [open]);

  async function processar() {
    if (!arquivo) return;
    setErro(null);
    setProcessando(true);
    try {
      const envio = arquivo.type.startsWith('image/') ? await compressImage(arquivo, 2400, 0.9) : arquivo;
      const fd = new FormData();
      fd.set('file', envio);
      const res = await fetch('/api/padronizacao/importar', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({})) as {
        error?: string; sourceFilePath?: string;
        ai?: { configured: boolean; ok: boolean; rascunho?: RascunhoDaFicha; error?: string };
      };
      if (!res.ok || !body.sourceFilePath) { setErro(body.error ?? 'Não foi possível enviar o arquivo.'); return; }

      const ai = body.ai;
      if (!ai || !ai.configured) {
        onPronto({ rascunho: null, sourceFilePath: body.sourceFilePath, foto: null, aviso: { tone: 'info', title: 'Leitura automática não configurada neste servidor.', description: 'O arquivo foi guardado. Preencha a ficha manualmente.' } });
        return;
      }
      if (!ai.ok || !ai.rascunho) {
        onPronto({ rascunho: null, sourceFilePath: body.sourceFilePath, foto: null, aviso: { tone: 'warning', title: 'Não foi possível interpretar esta ficha.', description: `${ai.error ?? 'A leitura falhou.'} O arquivo foi guardado; preencha os campos manualmente.` } });
        return;
      }

      let foto: File | null = null;
      if (ai.rascunho.photoBox && envio.type.startsWith('image/')) foto = await recortarFoto(envio, ai.rascunho.photoBox);

      const pendentes = ai.rascunho.lowConfidence.length;
      onPronto({
        rascunho: ai.rascunho,
        sourceFilePath: body.sourceFilePath,
        foto,
        aviso: pendentes > 0
          ? { tone: 'warning', title: 'Não foi possível interpretar completamente esta ficha.', description: `${pendentes} campo(s) marcado(s) "Revisar informação" — confira antes de publicar. Nada foi inventado.` }
          : { tone: 'info', title: 'Ficha lida. Confira os dados antes de publicar.', description: foto ? 'A foto do produto foi recortada do arquivo — confirme se é a certa.' : (envio.type === 'application/pdf' ? 'Em PDF a foto não é extraída: envie a foto do produto abaixo, se tiver.' : undefined) },
      });
    } catch {
      setErro('Falha de rede ao enviar o arquivo. Tente de novo.');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Importar ficha"
      description="Envie a foto ou o PDF da ficha de padronização. A leitura automática sugere os dados; você confere e publica."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={processando}>Cancelar</Button>
          <Button type="button" onClick={processar} disabled={!arquivo} loading={processando}>Processar ficha</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {erro && <Banner tone="danger" title={erro} onDismiss={() => setErro(null)} />}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={processando}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-sunken px-4 py-8 text-center transition-colors duration-sgo-1 ease-sgo-std hover:border-brand"
        >
          {processando ? <Loader2 className="h-6 w-6 animate-spin text-brand motion-reduce:animate-none" aria-hidden /> : <FileUp className="h-6 w-6 text-brand" aria-hidden />}
          <span className="text-sm font-semibold text-ink-900">{arquivo ? arquivo.name : 'Escolher arquivo da ficha'}</span>
          <span className="text-xs text-ink-500">{processando ? 'Lendo a ficha… isso leva alguns segundos.' : 'Foto (JPG, PNG, WEBP) ou PDF, até 25 MB.'}</span>
        </button>
        <ul className="space-y-1 text-xs text-ink-500">
          <li>A leitura interpreta o conteúdo, não a posição — fichas com layout diferente também entram.</li>
          <li>O que não for lido com segurança fica em branco e marcado para revisão. Nada é inventado.</li>
          <li>Nada é publicado antes de você conferir e clicar em &ldquo;Salvar e publicar&rdquo;.</li>
        </ul>
      </div>
    </Sheet>
  );
}
