import type { ChecklistFieldKind } from '@prisma/client';

/** Tipos de campo oferecidos nas fichas por link (VERIFICATION fica de fora — é dos diários). */
export const FORM_FIELD_KINDS: { kind: ChecklistFieldKind; label: string; hasOptions?: boolean; answerable?: boolean }[] = [
  { kind: 'SECTION', label: 'Subtítulo / seção', answerable: false },
  { kind: 'SHORT_TEXT', label: 'Texto curto', answerable: true },
  { kind: 'TEXTAREA', label: 'Observação (texto livre)', answerable: true },
  { kind: 'NUMBER', label: 'Número', answerable: true },
  { kind: 'TIME', label: 'Horário', answerable: true },
  { kind: 'DATE', label: 'Data', answerable: true },
  { kind: 'SELECT', label: 'Lista suspensa', hasOptions: true, answerable: true },
  { kind: 'BOOLEAN', label: 'Sim/Não (marcar)', answerable: true },
];

export const FORM_FIELD_KIND_SET = new Set<ChecklistFieldKind>(FORM_FIELD_KINDS.map((f) => f.kind));

/** Um campo da ficha, como exposto para renderizar (config e público). */
export interface FormFieldView {
  id: string;
  kind: ChecklistFieldKind;
  label: string;
  section: string | null;
  required: boolean;
  options: string[];
  order: number;
}

/** Uma resposta gravada no snapshot JSON do envio. */
export interface SubmissionAnswer {
  itemId: string;
  label: string;
  kind: ChecklistFieldKind;
  value: string | number | boolean | null;
}

export const MAX_TEXT_LEN = 500;
