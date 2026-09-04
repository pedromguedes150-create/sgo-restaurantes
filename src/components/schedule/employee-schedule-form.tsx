'use client';

import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { DIAS_DA_SEMANA, MODO_LABEL, MODO_EXPLICACAO, DOMINGO_A_CADA_PADRAO, SEMANAS_NO_MES, semanasComDomingo, type ModoDeFolga } from '@/lib/schedule/vigencia';

export interface TipoDeEscala {
  id: string;
  name: string;
  workDays: number;
  offDays: number;
  startTime: string | null;
  breakTime: string | null;
  endTime: string | null;
}
export interface Pessoa { id: string; name: string }
export interface UnidadeOpt { id: string; name: string }
export interface Turno { id: string; name: string; startTime: string | null; endTime: string | null }

/** Hoje em ISO, no relógio de quem está usando a tela. */
function hojeISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Configuração de escala do colaborador — com dia de folga e vigência.
 *
 * O campo que decide tudo é o **"a partir de quando vale"**: cada gravação abre
 * uma vigência e fecha a anterior na véspera. Sem ele, mudar a folga de alguém
 * reescreveria a grade dos meses já fechados.
 */
export function EmployeeScheduleForm({
  unitId,
  pessoas,
  tipos,
  turnos,
  post,
  busy,
  pessoaFixa,
  unidades = [],
}: {
  unitId: string;
  pessoas: Pessoa[];
  tipos: TipoDeEscala[];
  turnos: Turno[];
  post: (p: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  /** Aberto DENTRO de um colaborador: o seletor de pessoa sai de cena. */
  pessoaFixa?: Pessoa;
  /** Unidades da pessoa — só aparece quando ela está em mais de uma. */
  unidades?: UnidadeOpt[];
}) {
  const [collaboratorId, setCollaboratorId] = useState(pessoaFixa?.id ?? '');
  const [unidade, setUnidade] = useState(unitId);
  const [templateId, setTemplateId] = useState(tipos[0]?.id ?? '');
  const [startDate, setStartDate] = useState(hojeISO);
  const [modo, setModo] = useState<ModoDeFolga>('FIXED_WEEKLY');
  const [offDay, setOffDay] = useState('0');
  const [aCada, setACada] = useState(String(DOMINGO_A_CADA_PADRAO));
  const [anchor, setAnchor] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [entrada, setEntrada] = useState('');
  const [pausa, setPausa] = useState('');
  const [saida, setSaida] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const tipo = useMemo(() => tipos.find((t) => t.id === templateId) ?? null, [tipos, templateId]);
  /* Dia fixo de folga só existe em ciclo que fecha na semana. Em ciclo de outro
     tamanho a folga anda sozinha, e mostrar o campo prometeria o que o gerador
     não cumpre. */
  const semanal = tipo ? tipo.workDays + tipo.offDays === 7 : false;

  async function salvar() {
    setErro(null);
    if (!collaboratorId) { setErro('Selecione o colaborador.'); return; }
    if (!templateId) { setErro('Selecione o tipo de escala.'); return; }
    if (!startDate) { setErro('Informe a partir de quando esta escala vale.'); return; }
    if (!semanal && !anchor) { setErro('Este ciclo não fecha na semana — informe o dia de início do ciclo.'); return; }

    const ok = await post({
      action: 'saveEmployeeSchedule',
      collaboratorId, unitId: unidade || unitId, templateId, startDate,
      offMode: semanal ? modo : 'CYCLE_ONLY',
      weeklyOffDay: semanal ? Number(offDay) : null,
      sundayEveryWeeks: semanal && modo === 'FIXED_PLUS_SUNDAY' ? Number(aCada) : null,
      anchorDate: semanal ? null : anchor,
      shiftId: shiftId || null,
      startTime: entrada || null, breakTime: pausa || null, endTime: saida || null,
    });
    /* Dentro do colaborador a folha fecha sozinha; no formulário solto, limpa
       para o próximo cadastro. */
    if (ok && !pessoaFixa) { setCollaboratorId(''); setEntrada(''); setPausa(''); setSaida(''); }
  }

  return (
    <div className={pessoaFixa ? 'print:hidden' : 'rounded-lg border bg-surface p-3 print:hidden'}>
      {!pessoaFixa && <h3 className="mb-1 text-sm font-bold text-ink-900">Configuração de escala do colaborador</h3>}
      <p className="mb-3 text-xs text-ink-500">
        O que for gravado vale <b>a partir da data informada</b>. A configuração anterior é fechada na véspera — os meses
        já passados continuam mostrando o que valia neles.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pessoaFixa ? (
          unidades.length > 1 ? (
            <Select
              label="Unidade desta escala" size="sm"
              value={unidade} onValueChange={setUnidade}
              options={unidades.map((u) => ({ value: u.id, label: u.name }))}
            />
          ) : null
        ) : (
          <Select
            label="Colaborador" size="sm" placeholder="Selecione…"
            value={collaboratorId} onValueChange={setCollaboratorId}
            options={pessoas.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        <Select
          label="Tipo de escala" size="sm" placeholder="Selecione…"
          value={templateId} onValueChange={setTemplateId}
          options={tipos.map((t) => ({ value: t.id, label: t.name, hint: `${t.workDays}x${t.offDays}` }))}
        />
      </div>

      {tipo && (
        <p className="mt-1 text-[11px] text-ink-500">
          Ciclo: trabalha {tipo.workDays}, folga {tipo.offDays} · {tipo.workDays + tipo.offDays} dia(s)
          {semanal ? ' · fecha na semana' : ' · não fecha na semana'}
        </p>
      )}

      {/* CONFIGURAÇÃO DE FOLGA — o que faltava. */}
      <div className="mt-3 rounded-md border border-line-strong p-2.5">
        <p className="mb-2 text-sm font-semibold text-ink-900">Configuração de folga</p>

        {semanal ? (
          <div className="space-y-2">
            <Select
              label="Como funciona a folga desse colaborador?" size="sm"
              value={modo} onValueChange={(v) => setModo(v as ModoDeFolga)}
              options={(['FIXED_WEEKLY', 'FIXED_PLUS_SUNDAY', 'CYCLE_ONLY'] as ModoDeFolga[]).map((m) => ({ value: m, label: MODO_LABEL[m] }))}
            />
            <p className="text-[11px] text-ink-500">{MODO_EXPLICACAO[modo]}</p>

            {modo !== 'CYCLE_ONLY' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select
                  label="Dia fixo de folga" size="sm" value={offDay} onValueChange={setOffDay}
                  options={DIAS_DA_SEMANA.map((nome, i) => ({ value: String(i), label: nome }))}
                />
                {modo === 'FIXED_PLUS_SUNDAY' && (
                  <div>
                    <Label className="text-xs">Domingo a cada quantas semanas do mês?</Label>
                    <Input
                      inputMode="numeric" value={aCada} className="h-9 text-sm"
                      onChange={(e) => setACada(e.target.value.replace(/\D/g, '').slice(0, 1))}
                    />
                    {/* O efeito do número, escrito — em vez de pedir que a pessoa
                        imagine em quais semanas a folga vai cair. */}
                    <p className="mt-1 text-[11px] text-ink-500">
                      {Number(aCada) >= 1 && Number(aCada) <= SEMANAS_NO_MES
                        ? <>Folga no domingo da <b>{semanasComDomingo(Number(aCada)).map((s) => `${s}ª`).join(' e ')}</b> semana de cada mês. A conta recomeça todo dia 1º.</>
                        : <>Informe de 1 a {SEMANAS_NO_MES} — a conta é por semana do mês.</>}
                    </p>
                  </div>
                )}
              </div>
            )}

            {modo === 'CYCLE_ONLY' && (
              <p className="text-[11px] text-ink-500">
                Neste modo a folga anda conforme o ciclo, a partir da data de início da vigência.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-ink-500">
              Este ciclo <b>não fecha na semana</b>, então a folga anda de dia da semana sozinha — não há dia fixo a
              escolher. Informe em que dia o ciclo começa.
            </p>
            <DatePicker label="Início do ciclo" size="sm" value={anchor || null} onValueChange={(v) => setAnchor(v ?? '')} />
          </div>
        )}

        <div className="mt-2">
          <DatePicker
            label="A partir de quando essa escala começa a valer?" size="sm"
            value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')}
          />
        </div>
      </div>

      {/* Horários: vazio herda do tipo de escala. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div><Label className="text-xs">Entrada</Label><Input value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder={tipo?.startTime ?? '14:00'} className="h-9 text-sm" /></div>
        <div><Label className="text-xs">Intervalo</Label><Input value={pausa} onChange={(e) => setPausa(e.target.value)} placeholder={tipo?.breakTime ?? '19:00'} className="h-9 text-sm" /></div>
        <div><Label className="text-xs">Saída</Label><Input value={saida} onChange={(e) => setSaida(e.target.value)} placeholder={tipo?.endTime ?? '22:17'} className="h-9 text-sm" /></div>
        <Select
          label="Turno (opcional)" size="sm" value={shiftId} onValueChange={setShiftId}
          options={[{ value: '', label: 'Sem turno' }, ...turnos.map((t) => ({ value: t.id, label: t.name }))]}
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-500">Horário em branco usa o do tipo de escala.</p>

      {erro && <p className="mt-2 text-sm font-medium text-danger">{erro}</p>}

      <div className="mt-3">
        <Button size="sm" disabled={busy} onClick={salvar}><Save className="h-4 w-4" /> Salvar escala</Button>
      </div>
    </div>
  );
}
