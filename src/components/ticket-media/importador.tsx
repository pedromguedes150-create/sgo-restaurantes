'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import {
  MESES, emNumero, emReal, montarCompetencia, partesDaCompetencia,
  rotuloDaCompetencia, type Competencia,
} from '@/lib/ticket-media/calculo';

/**
 * IMPORTAR TICKET MÉDIO — competência, unidade, arquivo, CONFERIR, gravar.
 *
 * A prévia não é enfeite. A planilha é a relação de cupons crua (uma linha por
 * cupom, milhares delas): ninguém confere isso no Excel antes de mandar, e
 * depois de gravado o número vira o consolidado do mês. A tela mostra o que o
 * SGO somou — e o que ele DESCARTOU — antes de qualquer gravação.
 *
 * O arquivo é reenviado na confirmação de propósito; o servidor soma de novo.
 * Mandar de volta os totais da prévia seria confiar num número que passou pelo
 * navegador.
 */

interface Previa {
  unitId: string; unitName: string; competencia: string; fileName: string;
  coupons: number; grossSales: number; discounts: number; receita: number; ticket: number | null;
  descartados: { status: string; quantidade: number; venda: number }[];
  avisos: string[]; rodape: string | null;
  jaExiste: boolean;
  existente?: { importedByName: string; importedAt: string; fileName: string; coupons: number; replacedCount: number };
}

export function Importador({
  unidades,
  competenciaInicial,
  anos,
  podeSubstituir,
}: {
  /** Só as participantes — CD e lanchonete não aparecem nem aqui. */
  unidades: { id: string; name: string }[];
  competenciaInicial: Competencia;
  anos: number[];
  podeSubstituir: boolean;
}) {
  const router = useRouter();
  const [competencia, setCompetencia] = useState<Competencia>(competenciaInicial);
  const [unitId, setUnitId] = useState<string | null>(unidades.length === 1 ? unidades[0].id : null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState<{ substituiu: boolean; previa: Previa } | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const { ano, mes } = partesDaCompetencia(competencia);

  function limparResultado() {
    setPrevia(null);
    setErro(null);
    setDuplicado(false);
  }

  async function enviar(acao: 'previa' | 'confirmar', substituir = false) {
    if (!unitId) { setErro('Escolha a unidade.'); return; }
    if (!arquivo) { setErro('Selecione a planilha do mês.'); return; }
    setOcupado(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.set('arquivo', arquivo);
      fd.set('unitId', unitId);
      fd.set('competencia', competencia);
      fd.set('acao', acao);
      if (substituir) fd.set('substituir', 'true');

      const res = await fetch('/api/ticket-medio/importar', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(body.error ?? 'Não foi possível ler a planilha.');
        setDuplicado(body.reason === 'DUPLICADO');
        if (acao === 'previa') setPrevia(null);
        return;
      }
      if (acao === 'previa') {
        setPrevia(body.previa);
        setDuplicado(Boolean(body.previa?.jaExiste));
      } else {
        setPronto({ substituiu: Boolean(body.substituiu), previa: body.previa });
        router.refresh();
      }
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  if (pronto) {
    const p = pronto.previa;
    return (
      <Card>
        <CardContent className="space-y-3 py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <p className="sgo-type-17 font-semibold text-ink-900">
            {pronto.substituiu ? 'Importação substituída!' : 'Importação concluída!'}
          </p>
          <p className="text-sm text-ink-500">
            {p.unitName} — {rotuloDaCompetencia(p.competencia)} · {emNumero(p.coupons)} cupons · ticket {emReal(p.ticket)}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setPronto(null); setArquivo(null); limparResultado(); if (campoArquivo.current) campoArquivo.current.value = ''; }}>
              Importar outra unidade
            </Button>
            <Button onClick={() => router.push(`/modulos/ticket-medio?competencia=${p.competencia}`)}>
              Ver o painel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Mês"
              required
              value={String(mes)}
              onValueChange={(v) => { setCompetencia(montarCompetencia(ano, Number(v))); limparResultado(); }}
              options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
            <Select
              label="Ano"
              required
              value={String(ano)}
              onValueChange={(v) => { setCompetencia(montarCompetencia(Number(v), mes)); limparResultado(); }}
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            />
            <Select
              label="Unidade"
              required
              className="sm:col-span-2"
              value={unitId}
              onValueChange={(v) => { setUnitId(v); limparResultado(); }}
              placeholder={unidades.length === 0 ? 'Nenhuma unidade participante' : 'Selecione…'}
              disabled={unidades.length === 0}
              hint="Só aparecem as unidades participantes do Ticket Médio nesta competência."
              options={unidades.map((u) => ({ value: u.id, label: u.name }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink-900" htmlFor="planilha">
              Planilha <span className="text-danger">*</span>
            </label>
            <input
              id="planilha"
              ref={campoArquivo}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); limparResultado(); }}
              className="sgo-control block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink-700 file:mr-3 file:rounded-control file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-900"
            />
            <p className="mt-1 text-xs text-ink-500">
              Relação de Cupons SAT/NFC-e exportada do Teknisa, em .xlsx. O SGO soma os cupons — não é preciso preencher nada à mão.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => enviar('previa')} loading={ocupado && !previa} disabled={!unitId || !arquivo}>
              <FileSpreadsheet className="h-4 w-4" /> Ler planilha e conferir
            </Button>
          </div>
        </CardContent>
      </Card>

      {erro && (
        <Banner
          tone={duplicado ? 'warning' : 'danger'}
          title={erro}
          description={duplicado && !podeSubstituir ? 'Substituir uma importação já feita é permitido só a quem administra o Ticket Médio.' : undefined}
        />
      )}

      {previa && <PreviaDaImportacao previa={previa} />}

      {previa && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => enviar('confirmar', previa.jaExiste)}
            loading={ocupado}
            disabled={previa.jaExiste && !podeSubstituir}
            size="lg"
          >
            {previa.jaExiste ? <><AlertTriangle className="h-5 w-5" /> Substituir importação</> : <><Upload className="h-5 w-5" /> Confirmar importação</>}
          </Button>
          <Button variant="secondary" size="lg" onClick={limparResultado}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

/** A folha de conferência: o que será gravado, e como a receita foi obtida. */
function PreviaDaImportacao({ previa: p }: { previa: Previa }) {
  const descartados = p.descartados.reduce((s, d) => s + d.quantidade, 0);

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <p className="sgo-type-11 font-semibold text-ink-900">Prévia da importação</p>

        {p.jaExiste && p.existente && (
          <Banner
            tone="warning"
            title={`Já existem dados de ${p.unitName} em ${rotuloDaCompetencia(p.competencia)}`}
            description={`Importado por ${p.existente.importedByName} em ${new Date(p.existente.importedAt).toLocaleString('pt-BR')} (${emNumero(p.existente.coupons)} cupons, arquivo ${p.existente.fileName})${p.existente.replacedCount > 0 ? ` · já substituído ${p.existente.replacedCount}×` : ''}. Confirmar agora substitui esses números.`}
          />
        )}

        <dl className="divide-y divide-line">
          <Linha rotulo="Unidade" valor={p.unitName} />
          <Linha rotulo="Competência" valor={rotuloDaCompetencia(p.competencia)} />
          <Linha rotulo="Arquivo" valor={p.fileName} />
          <Linha rotulo="Cupons" valor={emNumero(p.coupons)} />
          <Linha rotulo="Vr. Venda" valor={emReal(p.grossSales)} />
          <Linha rotulo="Vr. Desc." valor={emReal(p.discounts)} />
          <Linha rotulo="Receita" valor={emReal(p.receita)} forte apoio="Receita = Venda − Desconto" />
          <Linha rotulo="Ticket Médio" valor={emReal(p.ticket)} forte apoio="Ticket = Receita ÷ Cupons" />
        </dl>

        {descartados > 0 && (
          <Banner
            tone="info"
            title={`${emNumero(descartados)} cupom(ns) não entraram na conta`}
            description={`${p.descartados.map((d) => `${d.quantidade} ${d.status} (${emReal(d.venda)})`).join('; ')}. Cupom cancelado não é venda — somá-lo inflaria a receita e o ticket.`}
          />
        )}

        {p.avisos.map((a) => <Banner key={a} tone="info" title={a} />)}

        {p.rodape && (
          <p className="text-xs text-ink-500">
            A planilha declara: <span className="text-ink-700">{p.rodape}</span>. Confira se confere com a unidade escolhida — o SGO não decide a unidade pelo arquivo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor, forte, apoio }: { rotulo: string; valor: string; forte?: boolean; apoio?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-ink-500">
        {rotulo}
        {apoio && <span className="ml-2 text-xs text-ink-400">{apoio}</span>}
      </dt>
      <dd className={`tabular-nums ${forte ? 'sgo-type-17 font-semibold text-brand' : 'text-sm font-medium text-ink-900'}`}>{valor}</dd>
    </div>
  );
}
