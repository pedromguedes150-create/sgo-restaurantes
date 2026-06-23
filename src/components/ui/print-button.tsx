'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Botão que abre o diálogo de impressão (Salvar como PDF). Oculto na impressão. */
export function PrintButton({ label = 'Imprimir / Salvar PDF' }: { label?: string }) {
  return (
    <Button size="sm" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> {label}</Button>
  );
}
