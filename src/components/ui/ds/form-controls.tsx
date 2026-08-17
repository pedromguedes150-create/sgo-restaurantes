'use client';

import * as React from 'react';
import { Select, type SelectOption } from './select';
import { DatePicker } from './date-picker';
import type { controlSize } from './field';

/**
 * Versões NÃO-CONTROLADAS do Select e do DatePicker (Onda 6), para os filtros
 * que vivem em <form method="get"> de Server Component.
 *
 * Por que existem: o Select/DatePicker do design system são controlados, e um
 * Server Component não pode passar onValueChange (função não atravessa o limite
 * do RSC). Além disso um <button> não entra no envio do formulário — o nativo
 * entrava porque tinha `name`.
 *
 * Aqui o estado é local (semeado por `defaultValue`, como o nativo fazia) e um
 * <input type="hidden"> carrega o valor com o mesmo `name`. Do ponto de vista
 * da página, nada muda: o form continua um GET simples, sem JS de navegação.
 */
export function FormSelect({
  name, defaultValue = '', options, label, size, className, 'aria-label': ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  options: SelectOption[];
  label?: string;
  size?: keyof typeof controlSize;
  className?: string;
  'aria-label'?: string;
}) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <div className={className}>
      <input type="hidden" name={name} value={value} />
      <Select label={label} aria-label={ariaLabel} size={size} options={options} value={value} onValueChange={setValue} />
    </div>
  );
}

export function FormDatePicker({
  name, defaultValue = '', label, size, min, max, className, 'aria-label': ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  label?: string;
  size?: keyof typeof controlSize;
  min?: string; max?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <div className={className}>
      <input type="hidden" name={name} value={value} />
      <DatePicker
        label={label} aria-label={ariaLabel} size={size} min={min} max={max}
        value={value || null} onValueChange={(v) => setValue(v ?? '')}
      />
    </div>
  );
}
