'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Modal } from '@/components/ui/ds/modal';
import { Banner } from '@/components/ui/ds/banner';

/**
 * Botão "Reativar" da recuperação (v1.132.1). A lista vem do servidor; aqui só
 * se confirma — digitando o nome da unidade — e se chama a rota, que refaz a
 * análise antes de tocar em alguém.
 */
export function RhReativarClient({ unitId, unitName, ids, nomes }: { unitId: string; unitName: string; ids: string[]; nomes: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; title: string; description?: string } | null>(null);

  async function reativar() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/rh/recuperacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, ids }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: 'danger', title: d.error ?? 'Não foi possível reativar' }); return; }
      setAberto(false);
      setMsg({ tone: 'success', title: `${d.reativados} colaborador(es) reativado(s)`, description: d.ignorados ? `${d.ignorados} ignorado(s): não eram "inativado por ausência" no momento da execução.` : undefined });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      {msg && <Banner tone={msg.tone} title={msg.title} description={msg.description} onDismiss={() => setMsg(null)} />}
      <Button size="sm" disabled={ids.length === 0 || busy} onClick={() => { setDigitado(''); setAberto(true); }}>
        <RotateCcw className="h-4 w-4" /> Reativar os {ids.length} inativados por ausência
      </Button>
      <Modal
        open={aberto}
        onClose={() => !busy && setAberto(false)}
        title={`Reativar ${ids.length} colaborador(es)`}
        description="Só volta a ativo quem o RH devolve, agora, com status de vínculo ativo. Cargo, matrícula, CPF e unidades não mudam. Fica na Auditoria com a lista de nomes."
        footer={<>
          <Button variant="secondary" onClick={() => setAberto(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={reativar} loading={busy} disabled={digitado.trim().toLocaleLowerCase('pt-BR') !== unitName.trim().toLocaleLowerCase('pt-BR')}>Confirmar reativação</Button>
        </>}
      >
        <div className="space-y-2 text-sm">
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-line bg-canvas p-2 text-xs text-ink-700">
            {nomes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <Input label={`Para confirmar, digite o nome da unidade: ${unitName}`} value={digitado} onChange={(e) => setDigitado(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
