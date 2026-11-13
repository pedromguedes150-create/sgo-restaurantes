import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { avaliarSaude, deveAvisar, situacaoGeral, LIMITES, INTERVALO_DO_ALERTA_MS, type AmostraDeSaude } from '@/lib/monitor/saude-regras';
import { urlComPool } from '@/lib/db/prisma';
import { coletarAmostra } from '@/lib/monitor/saude';

/** v1.206.0 — o servidor avisa ANTES de falhar. */

const boa = (o: Partial<AmostraDeSaude> = {}): AmostraDeSaude => ({
  em: '2026-11-13T12:00:00Z', dbMs: 5, loopMs: 2, memoriaPct: 50, processoMb: 300, discoPct: 40, discoLivreGb: 90, conexoesPct: 10, ...o,
});

describe('avaliarSaude', () => {
  it('tudo normal: nenhum alerta', () => {
    expect(avaliarSaude(boa())).toEqual([]);
    expect(situacaoGeral([])).toBe('OK');
  });

  it('disco: atenção aos 80%, crítico aos 90% — antes de encher', () => {
    expect(avaliarSaude(boa({ discoPct: 79.9 }))).toEqual([]);
    expect(avaliarSaude(boa({ discoPct: LIMITES.discoAtencao }))[0]).toMatchObject({ chave: 'DISCO', nivel: 'ATENCAO' });
    const c = avaliarSaude(boa({ discoPct: 93, discoLivreGb: 10.5 }));
    expect(c[0]).toMatchObject({ chave: 'DISCO', nivel: 'CRITICO' });
    expect(c[0].texto).toContain('10,5 GB');
    expect(situacaoGeral(c)).toBe('CRITICO');
  });

  it('banco fora é crítico na hora; banco lento só depois de 3 medições seguidas', () => {
    expect(avaliarSaude(boa({ dbMs: null }))[0]).toMatchObject({ chave: 'BANCO_FORA', nivel: 'CRITICO' });
    const lenta = boa({ dbMs: 600 });
    expect(avaliarSaude(lenta, [])).toEqual([]); // uma medição ruim é ruído
    expect(avaliarSaude(lenta, [lenta])).toEqual([]);
    expect(avaliarSaude(lenta, [lenta, lenta])[0]).toMatchObject({ chave: 'BANCO_LENTO', nivel: 'ATENCAO' });
    expect(avaliarSaude(lenta, [boa(), lenta])).toEqual([]); // não foram seguidas
    const muito = boa({ dbMs: 2000 });
    expect(avaliarSaude(muito, [muito, muito])[0]).toMatchObject({ chave: 'BANCO_LENTO', nivel: 'CRITICO' });
  });

  it('memória, conexões e servidor travando', () => {
    expect(avaliarSaude(boa({ memoriaPct: 88 }))[0]).toMatchObject({ chave: 'MEMORIA', nivel: 'ATENCAO' });
    expect(avaliarSaude(boa({ memoriaPct: 95 }))[0]).toMatchObject({ chave: 'MEMORIA', nivel: 'CRITICO' });
    expect(avaliarSaude(boa({ conexoesPct: 75 }))[0]).toMatchObject({ chave: 'CONEXOES', nivel: 'ATENCAO' });
    const travando = boa({ loopMs: 400 });
    expect(avaliarSaude(travando, [travando, travando])[0]).toMatchObject({ chave: 'SERVIDOR_LENTO', nivel: 'ATENCAO' });
  });

  it('o que não deu para medir não vira alerta', () => {
    expect(avaliarSaude(boa({ discoPct: null, memoriaPct: null, conexoesPct: null }))).toEqual([]);
  });
});

describe('deveAvisar — o mesmo alerta não vira enxurrada', () => {
  const disco = avaliarSaude(boa({ discoPct: 85 }))[0];
  const critico = avaliarSaude(boa({ discoPct: 95 }))[0];
  const t = 1_000_000_000;
  it('primeira vez avisa; repete só depois do intervalo', () => {
    expect(deveAvisar(disco, undefined, t)).toBe(true);
    expect(deveAvisar(disco, { nivel: 'ATENCAO', em: t }, t + 60_000)).toBe(false);
    expect(deveAvisar(disco, { nivel: 'ATENCAO', em: t }, t + INTERVALO_DO_ALERTA_MS.ATENCAO)).toBe(true);
  });
  it('subir de atenção para crítico avisa na hora', () => {
    expect(deveAvisar(critico, { nivel: 'ATENCAO', em: t }, t + 1000)).toBe(true);
    expect(deveAvisar(critico, { nivel: 'CRITICO', em: t }, t + 1000)).toBe(false);
  });
});

describe('pool de conexões', () => {
  it('em produção ganha connection_limit; fora dela e quando já definido, fica como está', () => {
    expect(urlComPool('postgres://u:p@h/db', true)).toBe('postgres://u:p@h/db?connection_limit=20&pool_timeout=20');
    expect(urlComPool('postgres://u:p@h/db?schema=public', true)).toBe('postgres://u:p@h/db?schema=public&connection_limit=20&pool_timeout=20');
    expect(urlComPool('postgres://u:p@h/db?connection_limit=7', true)).toBe('postgres://u:p@h/db?connection_limit=7');
    expect(urlComPool('postgres://u:p@h/db', false)).toBe('postgres://u:p@h/db');
    expect(urlComPool(undefined, true)).toBeUndefined();
  });
});

describe('coletarAmostra', () => {
  it('mede sem lançar — com o banco fora, dbMs vem nulo em vez de erro', async () => {
    const a = await coletarAmostra();
    expect(a.dbMs === null || a.dbMs >= 0).toBe(true);
    if (a.dbMs === null) expect(a.conexoesPct).toBeNull();
    expect(a.loopMs).toBeGreaterThanOrEqual(0);
    expect(a.processoMb).toBeGreaterThan(0);
  });
});
