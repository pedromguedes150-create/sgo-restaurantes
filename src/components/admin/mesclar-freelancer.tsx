'use client';

import * as React from 'react';
import { Merge } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Modal } from '@/components/ui/ds/modal';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { postAdmin } from '@/lib/admin-client';
import { formatarCpf } from '@/lib/cpf';
import { candidatosADestino } from '@/lib/payments/duplicados';

/**
 * MESCLAR um cadastro duplicado de freelancer no definitivo.
 *
 * A caixa mostra ANTES de confirmar o que vai acontecer: quantas solicitações
 * mudam de dono, quais unidades entram, o que é copiado. "Confirmar" é o único
 * clique que grava; o duplicado some só depois de tudo transferido.
 */
export interface FreelancerMesclavel {
  id: string; name: string; cpf: string | null; pixKey: string | null; active: boolean;
  units: string[]; unitIds: string[]; sectorRates: { sectorName: string; dayValue: number }[]; requestCount: number;
}

export function MesclarFreelancer({ duplicado, todos, onMesclou }: {
  duplicado: FreelancerMesclavel;
  todos: FreelancerMesclavel[];
  onMesclou: (msg: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [destinoId, setDestinoId] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const candidatos = React.useMemo(() => candidatosADestino(todos, duplicado.id), [todos, duplicado.id]);
  const destino = candidatos.find((c) => c.id === destinoId) ?? null;
  const unidadesNovas = destino ? duplicado.units.filter((u) => !destino.units.includes(u)) : [];
  const setoresNovos = destino ? duplicado.sectorRates.filter((r) => !destino.sectorRates.some((d) => d.sectorName === r.sectorName)) : [];
  const cpfConflita = Boolean(destino && duplicado.cpf && destino.cpf && duplicado.cpf !== destino.cpf);

  async function confirmar() {
    if (!destino) return;
    setOcupado(true); setErro(null);
    const r = await postAdmin({ entity: 'freelancer', action: 'merge', duplicadoId: duplicado.id, destinoId: destino.id });
    setOcupado(false);
    if (!r.ok) { setErro(r.error ?? 'Não foi possível mesclar.'); return; }
    setOpen(false);
    onMesclou(`"${duplicado.name}" foi mesclado em "${destino.name}": ${duplicado.requestCount} solicitação(ões) transferida(s).`);
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setErro(null); setDestinoId(null); setOpen(true); }} aria-label="Mesclar com outro cadastro" title="Mesclar com outro cadastro">
        <Merge className="h-4 w-4" />
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Mesclar cadastros"
        description={`"${duplicado.name}" é um cadastro duplicado? Escolha o cadastro DEFINITIVO: o histórico dele vai para lá e este é removido — sem perder nada.`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={ocupado}>Cancelar</Button>
            <Button onClick={confirmar} loading={ocupado} disabled={!destino || cpfConflita}>Confirmar mesclagem</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {erro && <Banner tone="danger" title={erro} onDismiss={() => setErro(null)} />}
          <Select
            label="Cadastro definitivo (fica)"
            placeholder="Escolha…"
            searchable
            value={destinoId}
            onValueChange={setDestinoId}
            options={candidatos.map((c) => ({
              value: c.id,
              label: c.name,
              hint: [c.cpf ? `CPF ${formatarCpf(c.cpf)}` : 'sem CPF', c.units.join(', '), `${c.requestCount} solicitação(ões)`, c.active ? null : 'inativo'].filter(Boolean).join(' · '),
            }))}
            hint="Homônimos aparecem primeiro. Normalmente o definitivo é o que tem CPF."
          />
          {destino && (
            <div className="rounded-card border border-line bg-sunken p-3 text-sm text-ink-700">
              <p className="font-semibold text-ink-900">O que vai acontecer</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li><b>{duplicado.requestCount}</b> solicitação(ões) de pagamento de &ldquo;{duplicado.name}&rdquo; passam a ser de &ldquo;{destino.name}&rdquo; — nome, valor e PIX gravados em cada uma <b>não mudam</b>.</li>
                <li>Unidades: {unidadesNovas.length > 0 ? <>entram <b>{unidadesNovas.join(', ')}</b> nas de &ldquo;{destino.name}&rdquo;</> : 'nenhuma nova (as mesmas que o definitivo já tem)'}.</li>
                <li>Valores por setor: {setoresNovos.length > 0 ? <>{setoresNovos.map((s) => s.sectorName).join(', ')} são copiados</> : 'nada a copiar'}.</li>
                {!destino.cpf && duplicado.cpf && <li>O CPF {formatarCpf(duplicado.cpf)} passa para o definitivo (que está sem CPF).</li>}
                {!destino.pixKey && duplicado.pixKey && <li>A chave PIX &ldquo;{duplicado.pixKey}&rdquo; passa para o definitivo (que está sem PIX).</li>}
                <li>Por fim, o cadastro &ldquo;{duplicado.name}&rdquo; ({duplicado.cpf ? `CPF ${formatarCpf(duplicado.cpf)}` : 'sem CPF'}) é removido. Tudo fica na Auditoria.</li>
              </ul>
            </div>
          )}
          {cpfConflita && <Banner tone="warning" title="Os dois cadastros têm CPF diferente." description="Não parecem ser a mesma pessoa. Confira antes — a mesclagem está bloqueada neste caso." />}
        </div>
      </Modal>
    </>
  );
}
