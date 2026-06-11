import Link from 'next/link';
import { Trash2, ClipboardList, Ticket, Boxes, AlertOctagon, Wallet, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const MODULES = [
  { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2, ready: true },
  { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon, ready: true },
  { href: '/modulos/comandas', label: 'Comandas', icon: ClipboardList, ready: true },
  { href: '/modulos/cancelamentos', label: 'Cancelamentos', icon: Ticket, ready: true },
  { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet, ready: true },
  { href: '#', label: 'Inventário', icon: Boxes, ready: false },
  { href: '#', label: 'Notas', icon: Receipt, ready: false },
];

export default function ModulosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Módulos</h1>
      <div className="grid grid-cols-2 gap-3">
        {MODULES.map(({ href, label, icon: Icon, ready }) => {
          const inner = (
            <Card className={ready ? 'transition-colors hover:border-accent' : 'opacity-60'}>
              <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
                <Icon className={ready ? 'h-7 w-7 text-brand' : 'h-7 w-7 text-muted-foreground'} />
                <span className="text-sm font-semibold">{label}</span>
                {!ready && <span className="text-[10px] text-muted-foreground">em breve</span>}
              </CardContent>
            </Card>
          );
          return ready ? (
            <Link key={label} href={href}>
              {inner}
            </Link>
          ) : (
            <div key={label}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
