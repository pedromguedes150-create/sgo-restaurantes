'use client';

import * as React from 'react';
import { Field, type controlSize } from './field';
import { DatePicker } from './date-picker';
import { TimePicker } from './time-picker';

/**
 * DateTimePicker do design system (Onda 6) — substitui <input type="datetime-local">.
 * Compõe DatePicker + TimePicker; a junção do par vive aqui e não repetida em
 * cada tela.
 *
 * Valor em 'AAAA-MM-DDTHH:MM' (horário local, sem fuso), o mesmo formato que o
 * datetime-local produzia — as telas que já convertem ISO↔local não mudam.
 *
 * Sem data não há valor: um prazo "às 18:00" de dia nenhum não significa nada.
 * Escolher só a data assume 23:59, que é o que "prazo até tal dia" quer dizer.
 */
export interface DateTimePickerProps {
  value: string; // '' quando vazio
  onValueChange: (v: string) => void;
  label?: string; hint?: string; error?: string; required?: boolean;
  disabled?: boolean;
  size?: keyof typeof controlSize;
  minuteStep?: number;
}

const split = (v: string): { date: string; time: string } => {
  const [d = '', t = ''] = v.split('T');
  return { date: d, time: t.slice(0, 5) };
};

export function DateTimePicker({
  value, onValueChange, label, hint, error, required, disabled, size = 'md', minuteStep = 5,
}: DateTimePickerProps) {
  const { date, time } = split(value);
  const emit = (d: string, t: string) => onValueChange(d ? `${d}T${t || '23:59'}` : '');

  // A mensagem de erro sai uma vez, no Field de fora; nos dois campos entra só a
  // borda. Passar `error` para os filhos repetiria o texto duas vezes.
  const tone = error ? 'border-danger' : undefined;

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <div className="flex gap-2">
        <div className="flex-1">
          <DatePicker
            aria-label={label ? `${label} — data` : 'Data'}
            value={date || null} onValueChange={(v) => emit(v ?? '', time)}
            size={size} disabled={disabled} className={tone}
          />
        </div>
        <div className="w-28">
          <TimePicker
            aria-label={label ? `${label} — hora` : 'Hora'}
            value={time || null} onValueChange={(v) => emit(date, v ?? '')}
            size={size} disabled={disabled || !date} minuteStep={minuteStep} className={tone}
          />
        </div>
      </div>
    </Field>
  );
}
