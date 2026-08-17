'use client';

import { useRouter } from 'next/navigation';
import { DatePicker } from '@/components/ui/ds/date-picker';

/** Seletor de dia operacional para lançar/corrigir desperdício de datas passadas. */
export function WasteDatePicker({ unitId, date, max }: { unitId: string; date: string; max: string }) {
  const router = useRouter();
  return (
    <div className="w-44">
      <DatePicker
        label="Dia do lançamento"
        value={date}
        max={max}
        onValueChange={(d) => router.push(`/modulos/desperdicios?unit=${unitId}${d ? `&date=${d}` : ''}`)}
      />
    </div>
  );
}
