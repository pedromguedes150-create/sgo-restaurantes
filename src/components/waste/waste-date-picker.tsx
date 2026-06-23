'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Seletor de dia operacional para lançar/corrigir desperdício de datas passadas. */
export function WasteDatePicker({ unitId, date, max }: { unitId: string; date: string; max: string }) {
  const router = useRouter();
  return (
    <div>
      <Label className="text-xs">Dia do lançamento</Label>
      <Input
        type="date"
        value={date}
        max={max}
        onChange={(e) => {
          const d = e.target.value;
          router.push(`/modulos/desperdicios?unit=${unitId}${d ? `&date=${d}` : ''}`);
        }}
        className="h-10 w-44 text-sm"
      />
    </div>
  );
}
