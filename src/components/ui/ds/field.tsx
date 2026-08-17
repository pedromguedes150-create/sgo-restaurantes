'use client';

import * as React from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Campos do design system (Onda 2). O invólucro <Field> cuida de rótulo, dica,
 * erro e associação acessível (label/aria-describedby/aria-invalid).
 * O erro NUNCA é só cor: vem com ícone + texto (DoD "nada só por cor").
 * Select e DatePicker (custom, sem nativo) ficam em arquivos próprios.
 */

/** Classe base dos controles — reaproveitada por Select e DatePicker. */
export const controlBase = [
  // .sgo-control só carrega o mínimo de 44px em ponteiro grosso (regra 8).
  'sgo-control w-full rounded-control border bg-surface text-ink-900',
  'placeholder:text-ink-500',
  'outline-none transition-colors duration-sgo-1 ease-sgo-std',
  'focus-visible:shadow-sgo-focus',
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-400',
  'motion-reduce:transition-none',
].join(' ');

export const controlSize = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-10 px-3 text-[14px]', lg: 'h-12 px-3.5 text-[15px]' };
export const controlTone = (invalid?: boolean) => (invalid ? 'border-danger' : 'border-line-strong hover:border-ink-400');

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  /** id do texto de dica/erro — o controle aponta para cá via aria-describedby. */
  descId?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, htmlFor, descId, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
          {required && <span className="sr-only"> (obrigatório)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={descId} className="flex items-center gap-1 text-[12px] font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-[12px] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Gera o id do texto auxiliar e diz se o controle deve apontar para ele. */
export function useDescribedBy(fieldId: string, hint?: string, error?: string) {
  const descId = `${fieldId}-desc`;
  return { descId, describedBy: hint || error ? descId : undefined };
}

/* ------------------------------------------------------------------- Input */

type Size = keyof typeof controlSize;
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string; hint?: string; error?: string; inputSize?: Size;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, inputSize = 'md', className, id, required, ...props }, ref) => {
    const auto = React.useId();
    const fieldId = id ?? auto;
    const { descId, describedBy } = useDescribedBy(fieldId, hint, error);
    return (
      <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} descId={descId}>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlBase, controlSize[inputSize], controlTone(!!error), className)}
          {...props}
        />
      </Field>
    );
  },
);
Input.displayName = 'Input';

/* ---------------------------------------------------------------- Textarea */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; hint?: string; error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className, id, required, rows = 4, ...props }, ref) => {
    const auto = React.useId();
    const fieldId = id ?? auto;
    const { descId, describedBy } = useDescribedBy(fieldId, hint, error);
    return (
      <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} descId={descId}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlBase, 'min-h-[80px] px-3 py-2 text-[14px] leading-6', controlTone(!!error), className)}
          {...props}
        />
      </Field>
    );
  },
);
Textarea.displayName = 'Textarea';

/* ------------------------------------------------------------- SearchField */

export interface SearchFieldProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  value: string;
  onValueChange: (v: string) => void;
}

export function SearchField({ value, onValueChange, inputSize = 'md', className, placeholder = 'Buscar…', label, hint, error, id, ...props }: SearchFieldProps) {
  const auto = React.useId();
  const fieldId = id ?? auto;
  const { descId, describedBy } = useDescribedBy(fieldId, hint, error);
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId} descId={descId}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          id={fieldId}
          type="search"
          role="searchbox"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={describedBy}
          className={cn(controlBase, controlSize[inputSize], controlTone(!!error), 'pl-8', value && 'pr-8', '[&::-webkit-search-cancel-button]:hidden', className)}
          {...props}
        />
        {value && (
          <button
            type="button"
            onClick={() => onValueChange('')}
            aria-label="Limpar busca"
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-control text-ink-400 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Field>
  );
}

/* ----------------------------------------------------------- CurrencyField */

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,56" -> 1234.56 · aceita dígitos, ponto e vírgula. */
export function parseBrl(text: string): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export interface CurrencyFieldProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (v: number | null) => void;
}

export function CurrencyField({ value, onValueChange, inputSize = 'md', className, label, hint, error, id, required, ...props }: CurrencyFieldProps) {
  const auto = React.useId();
  const fieldId = id ?? auto;
  const { descId, describedBy } = useDescribedBy(fieldId, hint, error);
  const [text, setText] = React.useState(value == null ? '' : fmt.format(value));
  const [focused, setFocused] = React.useState(false);

  // Enquanto não está em edição, o texto acompanha o valor de fora.
  React.useEffect(() => {
    if (!focused) setText(value == null ? '' : fmt.format(value));
  }, [value, focused]);

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} descId={descId}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-500">R$</span>
        <input
          id={fieldId}
          inputMode="decimal"
          required={required}
          aria-describedby={describedBy}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => { setText(e.target.value); onValueChange(parseBrl(e.target.value)); }}
          onBlur={() => { setFocused(false); const n = parseBrl(text); onValueChange(n); setText(n == null ? '' : fmt.format(n)); }}
          aria-invalid={error ? true : undefined}
          // Números sempre tabulares (regra 7) e alinhados à direita.
          className={cn(controlBase, controlSize[inputSize], controlTone(!!error), 'pl-9 text-right tabular-nums', className)}
          {...props}
        />
      </div>
    </Field>
  );
}
