import { prisma } from '@/lib/db/prisma';

/**
 * Categorias padrão dos tipos de MANUTENÇÃO das ocorrências.
 *
 * Por que existe: o tipo "Manutenção e obras" foi criado em produção sem
 * categoria nenhuma, e até a v1.43.0 isso travava o registro. Destravado, o
 * tipo funciona sem categorias — mas sem elas o sistema perde a **detecção de
 * reincidência**, que compara tipo + categoria na mesma unidade em menos de 30
 * dias. Sem categoria, "vazamento no telhado" e "disjuntor caindo" contam como
 * a mesma coisa, e o alerta de repetição deixa de significar algo.
 *
 * O que NÃO entra aqui: equipamento. "Câmara fria", "Fogão-forno" e "Sistema de
 * caixa" já são categorias de "Problema de Equipamento". Esta lista é do
 * PRÉDIO e das INSTALAÇÕES — a distinção é o que evita duas listas cobrindo a
 * mesma coisa, que é justamente a mistura reclamada no módulo.
 */
export const DEFAULT_MAINTENANCE_CATEGORIES = [
  'Elétrica',
  'Hidráulica e esgoto',
  'Climatização e ventilação',
  'Exaustão e coifa',
  'Instalação de gás',
  'Cobertura e telhado',
  'Estrutura e alvenaria',
  'Piso e revestimento',
  'Pintura e acabamento',
  'Portas, janelas e fechaduras',
  'Mobiliário e marcenaria',
  'Área externa e fachada',
  'Outros',
] as const;

/**
 * Cria as categorias padrão em cada tipo de manutenção que estiver SEM
 * nenhuma categoria ativa.
 *
 * A guarda é por tipo, e é o que importa: quem já organizou as próprias
 * categorias não tem a lista sobrescrita nem duplicada. Idempotente — roda a
 * cada boot sem efeito depois da primeira vez. Mesmo padrão do
 * `ensureDefaultModels()` da biblioteca de checklists.
 *
 * Devolve quantas categorias criou, para o log dizer se agiu.
 */
export async function ensureMaintenanceCategories(): Promise<number> {
  const tipos = await prisma.occurrenceType.findMany({
    where: { active: true, isMaintenance: true },
    select: { id: true, name: true, _count: { select: { categories: true } } },
  });

  let criadas = 0;
  for (const tipo of tipos) {
    // `_count.categories` conta TODAS, inclusive inativas: um tipo cujas
    // categorias foram desativadas de propósito não deve receber a lista de
    // volta na próxima subida.
    if (tipo._count.categories > 0) continue;

    await prisma.occurrenceCategory.createMany({
      data: DEFAULT_MAINTENANCE_CATEGORIES.map((name, i) => ({
        typeId: tipo.id,
        name,
        order: i + 1,
      })),
    });
    criadas += DEFAULT_MAINTENANCE_CATEGORIES.length;
    console.log(`[ocorrencias] ${DEFAULT_MAINTENANCE_CATEGORIES.length} categorias criadas em "${tipo.name}"`);
  }
  return criadas;
}
