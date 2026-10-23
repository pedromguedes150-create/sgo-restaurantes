'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { SgoModal } from '@/components/sgo/sgo-modal';

/**
 * Aba VÍNCULOS da Comissão (v1.178.0): a tabela de apelidos Teknisa × RH.
 * Nada aqui muda cadastro: só diz ao SGO que "1036 - JANAINA SOUZA" no Teknisa
 * é "Janaina Sousa Coelho" no RH — e a apuração usa isso todo mês.
 */

export interface VinculoUI {
  id: string; unitId: string; unidade: string; sellerCode: string; sellerName: string; collaboratorName: string; jobTitle: string | null;
  situacao: 'VINCULADO' | 'INATIVO' | 'FORA_DA_UNIDADE' | 'FUNCAO_FORA'; rotuloSituacao: string; createdByName: string; createdAt: string;
}
export interface IgnoradoUI { id: string; unidade: string; sellerCode: string; sellerName: string; collaboratorName: string; createdByName: string; createdAt: string }

const TOM = { VINCULADO: 'success', INATIVO: 'danger', FORA_DA_UNIDADE: 'warning', FUNCAO_FORA: 'neutral' } as const;

async function acao(body: Record<string, unknown>) {
  const r = await fetch('/api/comissao/vinculos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) as { error?: string } };
}

export function VinculosClient({ vinculos, ignorados, unidades, podeEditar }: { vinculos: VinculoUI[]; ignorados: IgnoradoUI[]; unidades: { id: string; name: string }[]; podeEditar: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [remover, setRemover] = useState<VinculoUI | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState({ unitId: unidades.length === 1 ? unidades[0].id : '', sellerCode: '', sellerName: '', collaboratorId: '' });
  const [colabs, setColabs] = useState<{ id: string; name: string }[]>([]);

  const visiveis = useMemo(() => {
    const t = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (!t) return vinculos;
    return vinculos.filter((v) => `${v.sellerCode} ${v.sellerName} ${v.collaboratorName} ${v.unidade}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(t));
  }, [busca, vinculos]);
  const comProblema = vinculos.filter((v) => v.situacao === 'INATIVO' || v.situacao === 'FORA_DA_UNIDADE').length;

  async function escolherUnidade(unitId: string) {
    setForm((f) => ({ ...f, unitId, collaboratorId: '' }));
    setColabs([]);
    const r = await fetch(`/api/comissao/colaboradores?unitId=${encodeURIComponent(unitId)}`);
    const b = await r.json().catch(() => ({}));
    setColabs(Array.isArray(b.colaboradores) ? b.colaboradores : []);
  }

  async function salvar() {
    setOcupado(true); setErro(null);
    const r = await acao({ acao: 'criar', ...form });
    setOcupado(false);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível salvar.'); return; }
    setNovo(false); setForm((f) => ({ ...f, sellerCode: '', sellerName: '', collaboratorId: '' }));
    router.refresh();
  }
  async function confirmarRemocao() {
    if (!remover) return;
    setOcupado(true); setErro(null);
    const r = await acao({ acao: 'remover', id: remover.id });
    setOcupado(false); setRemover(null);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível remover.'); return; }
    router.refresh();
  }
  async function desfazer(id: string) {
    const r = await acao({ acao: 'desfazerIgnorar', id });
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível desfazer.'); return; }
    router.refresh();
  }
  const fmt = (d: string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return (
    <div className="space-y-4" data-testid="vinculos-comissao">
      {erro && <Banner tone="danger" title={erro} />}
      {comProblema > 0 && <Banner tone="warning" title={`${comProblema} vínculo(s) apontam para quem saiu do RH ou da unidade`} description="Na próxima apuração esses vendedores voltam para “Fora da comissão”. Remova o vínculo ou crie o certo." />}

      <section className="sgo-panel sgo-panel--solid overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3 sm:px-4">
          <p className="sgo-panel__title flex items-center gap-2"><Link2 className="h-4 w-4" /> Tabela de vínculos · {vinculos.length}</p>
          <div className="flex items-center gap-2">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, código ou unidade" aria-label="Buscar vínculo" className="h-9 w-56 text-sm" />
            {podeEditar && <Button size="sm" onClick={() => { setErro(null); setNovo(true); if (form.unitId) void escolherUnidade(form.unitId); }}><Plus className="h-4 w-4" /> Novo vínculo</Button>}
          </div>
        </div>
        <p className="px-3 pb-2 pt-1 text-xs text-ink-500 sm:px-4">Relações entre o nome no Teknisa (pelo código do vendedor) e o colaborador no RH. Confirmar uma sugestão na apuração também grava aqui. O cadastro do RH e o do Teknisa não mudam.</p>
        {visiveis.length === 0 ? <p className="px-3 pb-3 text-sm text-ink-500 sm:px-4">{vinculos.length ? 'Nada encontrado nesta busca.' : 'Nenhum vínculo ainda — eles nascem quando a apuração casa um vendedor com alguém do RH.'}</p> : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead><tr><th className="text-left">Nome no RH</th><th className="text-left">Nome no Teknisa</th><th className="text-left">Unidade</th><th className="text-left">Situação</th><th className="text-left">Vinculado por</th>{podeEditar && <th />}</tr></thead>
              <tbody>
                {visiveis.map((v) => (
                  <tr key={v.id} data-testid="linha-vinculo">
                    <td className="font-medium text-ink-900">{v.collaboratorName}{v.jobTitle && <span className="block text-xs font-normal text-ink-500">{v.jobTitle}</span>}</td>
                    <td>{v.sellerCode} - {v.sellerName}</td>
                    <td className="text-xs text-ink-500">{v.unidade}</td>
                    <td><StatusBadge tone={TOM[v.situacao]} dot>{v.rotuloSituacao}</StatusBadge></td>
                    <td className="text-xs text-ink-500">{v.createdByName} · {fmt(v.createdAt)}</td>
                    {podeEditar && <td className="text-right"><button type="button" aria-label={`Remover vínculo de ${v.sellerName}`} className="rounded-control p-2 text-ink-500 hover:text-danger" onClick={() => setRemover(v)}><Trash2 className="h-4 w-4" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ignorados.length > 0 && (
        <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="sugestoes-ignoradas">
          <p className="sgo-panel__title px-3 pt-3 sm:px-4">Sugestões ignoradas · {ignorados.length}</p>
          <p className="px-3 pb-2 text-xs text-ink-500 sm:px-4">Pares marcados como pessoas diferentes — a sugestão não volta na apuração. Desfaça se foi engano.</p>
          <ul className="divide-y divide-line">
            {ignorados.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm sm:px-4">
                <span className="min-w-0"><b className="text-ink-900">{d.sellerCode} - {d.sellerName}</b> <span className="text-ink-500">não é</span> {d.collaboratorName}<span className="block text-xs text-ink-500">{d.unidade} · {d.createdByName} · {fmt(d.createdAt)}</span></span>
                {podeEditar && <Button size="sm" variant="secondary" onClick={() => void desfazer(d.id)}><Undo2 className="h-4 w-4" /> Desfazer</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <SgoModal open={novo} onClose={() => setNovo(false)} title="Novo vínculo Teknisa × RH"
        footer={<><Button variant="secondary" onClick={() => setNovo(false)}>Cancelar</Button><Button onClick={() => void salvar()} loading={ocupado} disabled={!form.unitId || !form.sellerCode.trim() || !form.sellerName.trim() || !form.collaboratorId}><Link2 className="h-4 w-4" /> Salvar vínculo</Button></>}>
        <div className="space-y-3">
          <Select label="Unidade" value={form.unitId || null} onValueChange={(v) => void escolherUnidade(v)} options={unidades.map((u) => ({ value: u.id, label: u.name }))} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-ink-500">Código no Teknisa<Input value={form.sellerCode} onChange={(e) => setForm((f) => ({ ...f, sellerCode: e.target.value }))} placeholder="1036" inputMode="numeric" className="mt-1 h-10 text-sm" /></label>
            <label className="block text-xs text-ink-500 sm:col-span-2">Nome no Teknisa<Input value={form.sellerName} onChange={(e) => setForm((f) => ({ ...f, sellerName: e.target.value }))} placeholder="JANAINA SOUZA" className="mt-1 h-10 text-sm" /></label>
          </div>
          <Select label="Colaborador no RH (ativo nesta unidade)" value={form.collaboratorId || null} onValueChange={(v) => setForm((f) => ({ ...f, collaboratorId: v }))} searchable
            disabled={!form.unitId} placeholder={form.unitId ? 'Escolher…' : 'Escolha a unidade primeiro'} options={colabs.map((c) => ({ value: c.id, label: c.name }))} />
          <p className="text-xs text-ink-500">O código é o número antes do nome na planilha do Teknisa (ex.: “1036 - JANAINA SOUZA”). Se já houver vínculo para esse código, ele é substituído.</p>
        </div>
      </SgoModal>

      <SgoModal open={!!remover} onClose={() => setRemover(null)} title="Remover este vínculo?"
        footer={<><Button variant="secondary" onClick={() => setRemover(null)}>Voltar</Button><Button onClick={() => void confirmarRemocao()} loading={ocupado}><Trash2 className="h-4 w-4" /> Remover</Button></>}>
        <p className="text-sm text-ink-700">{remover?.sellerCode} - {remover?.sellerName} deixa de apontar para {remover?.collaboratorName}. Apurações já gravadas não mudam; na próxima, o vendedor passa pela comparação de nomes de novo.</p>
      </SgoModal>
    </div>
  );
}
