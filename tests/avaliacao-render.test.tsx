import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas/avaliacao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { EvaluationClient, type EvalRow } from '@/components/people/evaluation-client';
import { AvaliacaoModelosConfig } from '@/components/admin/avaliacao-modelos-config';
import { montarCriterios } from '@/lib/people/avaliacao-calculo';

/**
 * Avaliação por função (v1.161.0) — o que a tela precisa dizer antes de
 * qualquer clique: quem está sem modelo, quem é gerencial, a nota/classificação
 * de quem já foi avaliado, e o aviso de CPF para quem avalia.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const m = montarCriterios([{ label: 'Qualidade do preparo', weight: 20 }, { label: 'Produtividade', weight: 15 }, { label: 'Cumprimento de POPs', weight: 15 }, { label: 'Controle de desperdícios', weight: 10 }]);
const criterios = m.ok ? m.criterios : [];
const modelo = { id: 'm1', name: 'Cozinheiro', managerial: false, version: 1, criterios };

const linha = (p: Partial<EvalRow>): EvalRow => ({
  collaboratorId: 'c1', name: 'Ana Cozinheira', jobTitle: 'COZINHEIRO(A)', unitId: 'u1', unitName: 'Centro', observationCount: 0,
  modelo, permissao: { pode: true, motivo: null }, ferias: false, evaluation: null, ...p,
});

describe('Avaliação do colaborador — quadro', () => {
  it('mostra Sem modelo, Gerencial, Férias e a nota com classificação', () => {
    const rows: EvalRow[] = [
      linha({}),
      linha({ collaboratorId: 'c2', name: 'Bruno Sem Cargo', jobTitle: 'CARGO NOVO', modelo: null, permissao: { pode: false, motivo: 'SEM_MODELO' } }),
      linha({ collaboratorId: 'c3', name: 'Carla Encarregada', modelo: { ...modelo, managerial: true, name: 'Gerente / Encarregado' }, permissao: { pode: false, motivo: 'GERENCIAL' }, ferias: true }),
      linha({ collaboratorId: 'c4', name: 'Davi Avaliado', evaluation: { nota: 4.37, classificacao: 'BOM', respostas: [], legado: null, modelName: 'Cozinheiro', modelVersion: 1, comments: null, evaluatorName: 'Ger', updatedAt: '2026-10-08T10:00:00Z' } }),
    ];
    const html = semSeparadores(renderToString(<EvaluationClient rows={rows} yearMonth="2026-10" months={['2026-10', '2026-09']} isAdmin={false} weight={0} semCpf />));
    expect(html).toContain('Sem modelo');
    expect(html).toContain('Gerencial');
    expect(html).toContain('Férias');
    expect(html).toContain('data-testid="aviso-sem-cpf"');
    expect(html).toContain('data-testid="aviso-sem-modelo"');
    // filtro padrão "A avaliar" esconde o já avaliado; a contagem diz 1/4
    expect(html).not.toContain('Davi Avaliado');
    expect(html).toContain('1/4 avaliado(s)');
    expect(html).toContain('Bruno Sem Cargo');
  });

  it('o aviso de sem modelo some quando todos têm modelo, e o Admin ganha o atalho para os modelos', () => {
    const html = semSeparadores(renderToString(<EvaluationClient rows={[linha({})]} yearMonth="2026-10" months={['2026-10']} isAdmin weight={0} semCpf={false} />));
    expect(html).not.toContain('data-testid="aviso-sem-modelo"');
    expect(html).not.toContain('data-testid="aviso-sem-cpf"');
    expect(html).toContain('/configuracoes/avaliacao');
  });
});

describe('Configurações → Avaliação por função', () => {
  it('lista o modelo com cargos e versão, e as funções sem modelo com o atalho de vínculo', () => {
    const html = semSeparadores(renderToString(
      <AvaliacaoModelosConfig
        modelos={[{ id: 'm1', name: 'Cozinheiro', managerial: false, active: true, seedKey: 'cozinheiro', versao: { id: 'v1', version: 2, criterios }, cargos: [{ jobTitle: 'COZINHEIRO(A)', jobTitleKey: 'cozinheiro(a)', colaboradores: 12 }], avaliacoes: 3 }]}
        semModelo={{ cargos: [{ jobTitle: 'FRENTISTA', jobTitleKey: 'frentista', colaboradores: 2, modeloInativo: null }], semCargo: 1 }}
        cargos={[{ jobTitle: 'COZINHEIRO(A)', jobTitleKey: 'cozinheiro(a)', colaboradores: 12 }, { jobTitle: 'FRENTISTA', jobTitleKey: 'frentista', colaboradores: 2 }]}
      />,
    ));
    expect(html).toContain('data-testid="modelo-cozinheiro"');
    expect(html).toContain('v2');
    expect(html).toContain('3 avaliação(ões)');
    expect(html).toContain('COZINHEIRO(A)');
    expect(html).toContain('Qualidade do preparo 20%');
    expect(html).toContain('data-testid="funcoes-sem-modelo"');
    expect(html).toContain('FRENTISTA');
    expect(html).toContain('1 colaborador(es) estão sem cargo no RH');
  });
});
