import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { apelidosDoConceito, conceitoCoberto } from '@/lib/stock/setor-sugerido';

/**
 * OS SETORES DO ROMANEIO DO CD.
 *
 * O classificador de setor (v1.105.0) sabe que uma Coca é bebida e um chiclete
 * é bomboniere, mas só consegue apontar para um setor que EXISTA no cadastro —
 * conceito sem setor cadastrado não sugere nada, de propósito. O cadastro tinha
 * três setores e o romaneio real do CD tem oito, então cinco conceitos ficavam
 * reconhecidos e sem destino.
 *
 * ESTE ARQUIVO CRIA SÓ O QUE FALTA, e a conferência não é pelo nome:
 *
 *  - Pelo NOME seria frágil — "Secos" e "DESPENSA COZINHA" são o mesmo lugar
 *    com nomes diferentes, e criar o segundo partiria a mercadoria entre duas
 *    filas, com dois separadores conferindo metade cada um. O pior tipo de
 *    duplicidade: ninguém vê erro, e a carga é que chega incompleta.
 *  - A conferência é pelo CONCEITO, com os mesmos apelidos que o classificador
 *    usa (`conceitoCoberto`). Se já houver "Carnes", "Açougue" ou "CARNES
 *    CHURRASCO", o conceito está coberto e nada é criado.
 *
 * Idempotente: rodar de novo não cria nada. Os nomes propostos são os do
 * romaneio, e renomear depois não quebra o classificador — ele casa por
 * apelido, não por nome exato.
 */

/**
 * Nome proposto × conceito que ele atende.
 *
 * `conceito` é um dos apelidos que o classificador conhece; os demais apelidos
 * daquele conceito vêm de lá, o que impede esta lista de virar uma segunda
 * cópia que envelhece sozinha.
 */
export const SETORES_DO_ROMANEIO: { nome: string; conceito: string }[] = [
  { nome: 'CARNES CHURRASCO', conceito: 'carne' },
  { nome: 'CÂMARAS FRIAS', conceito: 'camara' },
  { nome: 'SALGADOS', conceito: 'salgado' },
  { nome: 'CONFEITARIA', conceito: 'confeitaria' },
  { nome: 'DESPENSA COZINHA', conceito: 'despensa' },
  { nome: 'BOMBONIERE DIVERSOS', conceito: 'bomboniere' },
  { nome: 'BEBIDAS', conceito: 'bebida' },
  { nome: 'DESCARTÁVEIS', conceito: 'descartavel' },
];

export interface FaltantesDoCd {
  /** Conceitos sem setor cadastrado — os que seriam criados. */
  faltando: { nome: string; conceito: string }[];
  /** Conceitos já cobertos, e por qual setor. Para a tela explicar o que NÃO fez. */
  cobertos: { nome: string; por: string }[];
}

/**
 * A decisão, sem banco: dada a lista de setores ATIVOS, o que falta.
 *
 * Pura de propósito. A alternativa seria provar isto com testes que apagam e
 * recriam `cd_sectors` — uma tabela GLOBAL, sem escopo por unidade: rodando em
 * paralelo com os outros arquivos de teste, a limpeza derrubaria os setores que
 * eles acabaram de criar, e a falha apareceria no arquivo errado.
 */
export function faltantesDoRomaneio(setoresAtivos: { id: string; name: string }[]): FaltantesDoCd {
  const faltando: FaltantesDoCd['faltando'] = [];
  const cobertos: FaltantesDoCd['cobertos'] = [];
  for (const s of SETORES_DO_ROMANEIO) {
    const ja = conceitoCoberto(apelidosDoConceito(s.conceito), setoresAtivos);
    if (ja) cobertos.push({ nome: s.nome, por: ja.name });
    else faltando.push(s);
  }
  return { faltando, cobertos };
}

/** O que falta, sem criar nada. */
export async function conferirSetoresDoRomaneio(): Promise<FaltantesDoCd> {
  const setores = await prisma.cdSector.findMany({ where: { active: true }, select: { id: true, name: true } });
  return faltantesDoRomaneio(setores);
}

/**
 * Cria os setores do romaneio que ainda não têm equivalente.
 *
 * Segue o padrão de `ensureDefaultModels()`: chamada ao abrir a tela que
 * precisa deles, silenciosa quando não há nada a fazer. Não roda no boot de
 * propósito — criar registro de operação sem ninguém ter aberto a tela é o tipo
 * de coisa que aparece meses depois como "quem cadastrou isto?".
 */
export async function ensureSetoresDoRomaneio(): Promise<{ criados: string[] }> {
  const { faltando } = await conferirSetoresDoRomaneio();
  if (faltando.length === 0) return { criados: [] };

  const total = await prisma.cdSector.count();
  const criados: string[] = [];
  for (let i = 0; i < faltando.length; i++) {
    try {
      /* `name` é `@unique`: se dois acessos simultâneos tentarem criar o mesmo
         setor, o segundo falha e é ignorado — e não derruba o resto da lista. */
      const s = await prisma.cdSector.create({ data: { name: faltando[i].nome, order: total + i } });
      criados.push(s.name);
    } catch {
      continue;
    }
  }

  if (criados.length > 0) {
    await audit({
      action: 'CD_SECTOR_SEED', module: 'CONFIG', entity: 'cd_sector',
      metadata: {
        criados,
        motivo: 'Setores do romaneio do CD que ainda não tinham equivalente no cadastro.',
      },
    });
  }
  return { criados };
}
