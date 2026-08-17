import { Card, CardContent } from '@/components/ui/card';

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink-900">{title}</h1>
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-3xl">🚧</p>
          <p className="mt-2 font-semibold">Em construção</p>
          <p className="text-sm text-ink-500">{phase}</p>
        </CardContent>
      </Card>
    </div>
  );
}
