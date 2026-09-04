import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { MODULES } from '@/lib/permissions';
import { moduleOfPath, canOpenPath } from '@/lib/permissions/route-guard';

/**
 * Cobertura de rota — cada tela do sistema tem um dono na matriz de perfis.
 *
 * A guarda de rota resolve o caminho para o módulo com o `nav` mais longo. Uma
 * tela cujo endereço nenhum módulo prefixa fica FORA do mapa, e a guarda deixa
 * passar: era o caso da Escala, que qualquer usuário logado abria escrevendo o
 * endereço. Este teste percorre o disco, não uma lista escrita à mão — tela
 * nova sem dono quebra aqui.
 */

/** Telas pessoais/utilitárias: valem para qualquer usuário autenticado. */
const SEM_DONO_POR_DECISAO = new Set([
  '/modulos',        // hub do celular: ele mesmo filtra pelo que o perfil pode ver
  '/notificacoes',   // avisos do próprio usuário
  '/perfil',         // Meu Perfil
  '/pessoas',        // só um redirecionamento para /modulos/pessoas
]);

function rotasDePagina(dir: string, prefixo = ''): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name.startsWith('[')) continue; // rota dinâmica: o dono é o pai
      out.push(...rotasDePagina(path.join(dir, e.name), `${prefixo}/${e.name}`));
    } else if (e.name === 'page.tsx') {
      out.push(prefixo || '/');
    }
  }
  return out;
}

const ROTAS = rotasDePagina(path.join(process.cwd(), 'src/app/(app)'));

afterAll(async () => { await prisma.$disconnect(); });

describe('Toda tela tem um módulo dono', () => {
  it('achou as telas no disco (o teste não é vazio à toa)', () => {
    expect(ROTAS.length).toBeGreaterThan(60);
  });

  it('nenhuma tela fica fora do mapa', () => {
    const orfas = ROTAS.filter((r) => !SEM_DONO_POR_DECISAO.has(r) && !moduleOfPath(r));
    expect(orfas, `sem dono: ${orfas.join(', ')}`).toEqual([]);
  });

  it('cada dono é o mais específico que existe — a tela interna não cai no módulo pai', () => {
    expect(moduleOfPath('/modulos/escala/folgas')).toBe('SCHEDULE_OFF');
    expect(moduleOfPath('/modulos/escala')).toBe('SCHEDULE');
    expect(moduleOfPath('/modulos/notas/gas')).toBe('NOTES_GAS');
    expect(moduleOfPath('/modulos/notas')).toBe('NOTES');
    expect(moduleOfPath('/configuracoes/unidades')).toBe('CONFIG_UNITS');
    expect(moduleOfPath('/configuracoes')).toBe('CONFIG');
    /* Tela interna sem chave própria continua caindo no dono mais próximo. */
    expect(moduleOfPath('/configuracoes/modelos/imprimir')).toBe('CONFIG_MODELS');
    expect(moduleOfPath('/modulos/comandas/analise-aberto/consolidado')).toBe('COMMANDS_OPEN');
  });

  it('todo submenu com endereço é filho de alguém, e o pai vem antes', () => {
    const vistos = new Set<string>();
    for (const m of MODULES) {
      if (m.parent) expect(vistos.has(m.parent), `${m.key} antes do pai`).toBe(true);
      vistos.add(m.key);
    }
  });
});

describe('Admin e CEO abrem tudo', () => {
  it('nenhuma tela recusada', async () => {
    for (const role of ['ADMIN', 'CEO'] as const) {
      for (const r of ROTAS) expect(await canOpenPath(role, r), `${role} → ${r}`).toBe(true);
    }
  });
});

describe('O Gerente continua com o que já usava', () => {
  const DIA_A_DIA = [
    '/dashboard', '/minha-area', '/tarefas', '/tarefas/historico', '/tarefas/correcoes',
    '/modulos/desperdicios', '/modulos/comandas', '/modulos/comandas/conferencia',
    '/modulos/ocorrencias', '/modulos/ocorrencias/nova', '/modulos/notas', '/modulos/notas/gas',
    '/modulos/pagamentos', '/modulos/pessoas', '/modulos/pessoas/mapa', '/modulos/escala',
    '/modulos/escala/folgas', '/modulos/troco', '/modulos/metas', '/modulos/atestados',
    '/modulos/cancelamentos', '/modulos/cancelamentos/itens', '/modulos/gas', '/modulos/oleo',
    '/modulos/inventario', '/modulos/higiene', '/modulos/produtos', '/ajuda',
  ];

  it('abre todas as telas da rotina', async () => {
    for (const r of DIA_A_DIA) expect(await canOpenPath('MANAGER', r), r).toBe(true);
  });
});

describe('As telas de Configurações nascem restritas', () => {
  it('o Gerente não alcança cadastro nem integrações', async () => {
    /* Antes da v1.65.0 estas telas caíam no módulo CONFIG, que é aberto por
       padrão: a guarda deixava entrar e só a tela dizia "Restrito ao
       Administrador". Agora a recusa acontece antes. */
    for (const r of ['/configuracoes/unidades', '/configuracoes/usuarios', '/configuracoes/integracoes', '/configuracoes/perfis', '/configuracoes/pagamentos']) {
      expect(await canOpenPath('MANAGER', r), r).toBe(false);
    }
  });

  it('a Supervisão mantém o que a própria tela já lhe dava', async () => {
    /* Usuários (visualização), Fornecedores e Catálogo de produtos são as três
       telas de Configurações que a Supervisão abre hoje. */
    expect(await canOpenPath('SUPERVISOR', '/configuracoes/usuarios')).toBe(true);
    expect(await canOpenPath('SUPERVISOR', '/configuracoes/fornecedores')).toBe(true);
    expect(await canOpenPath('SUPERVISOR', '/configuracoes/produtos')).toBe(true);
    expect(await canOpenPath('SUPERVISOR', '/configuracoes/unidades')).toBe(false);
  });
});

describe('O Caixa continua trancado — e agora também fora da Escala', () => {
  it('abre só a conferência e a ajuda', async () => {
    expect(await canOpenPath('CASHIER', '/modulos/comandas/conferencia')).toBe(true);
    expect(await canOpenPath('CASHIER', '/ajuda')).toBe(true);
  });

  it('a grade de presença da rede deixou de ser alcançável por endereço', async () => {
    /* Buraco real fechado aqui: /modulos/escala não tinha módulo dono, então a
       guarda deixava QUALQUER usuário logado abrir a escala de todas as
       unidades — inclusive o Caixa. */
    expect(await canOpenPath('CASHIER', '/modulos/escala')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/escala/folgas')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/escala/avisos-rh')).toBe(false);
  });
});
