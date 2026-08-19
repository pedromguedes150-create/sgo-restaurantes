import { describe, it, expect } from 'vitest';
import { moduleOfPath } from '@/lib/permissions/route-guard';

/**
 * Guarda de rota por módulo.
 *
 * O furo que ela fecha: a matriz de perfis só escondia o item no MENU. Um perfil
 * Caixa — que existe apenas para bipar comandas — alcançava /modulos/executivo,
 * /modulos/pessoas (CPF e PIX) e /modulos/atestados (CID, dado sensível de LGPD)
 * digitando o endereço.
 *
 * Aqui testo o mapeamento caminho → módulo, que é a parte pura. A decisão de
 * liberar depende do banco (matriz de permissões) e roda no layout.
 */

describe('moduleOfPath — de quem é esta tela', () => {
  it('mapeia a raiz do módulo', () => {
    expect(moduleOfPath('/modulos/comandas')).toBe('COMMANDS');
    expect(moduleOfPath('/modulos/atestados')).toBe('CERTIFICATES');
    expect(moduleOfPath('/modulos/executivo')).toBe('EXECUTIVE');
    expect(moduleOfPath('/configuracoes')).toBe('CONFIG');
  });

  it('mapeia as telas internas do módulo', () => {
    expect(moduleOfPath('/modulos/comandas/conferencia')).toBe('COMMANDS');
    expect(moduleOfPath('/modulos/comandas/analise-aberto/consolidado')).toBe('COMMANDS');
    expect(moduleOfPath('/modulos/atestados/relatorio')).toBe('CERTIFICATES');
    expect(moduleOfPath('/configuracoes/usuarios')).toBe('CONFIG');
  });

  it('não confunde módulos de nome parecido', () => {
    // /modulos/notas/gas pertence a NOTAS, não a GÁS
    expect(moduleOfPath('/modulos/notas/gas')).toBe('NOTES');
    expect(moduleOfPath('/modulos/gas')).toBe('GAS');
  });

  it('escolhe sempre o caminho MAIS ESPECÍFICO', () => {
    // se um dia existir módulo com nav mais longo prefixado por outro,
    // o mais longo é que manda — senão a tela cairia no módulo errado
    const k = moduleOfPath('/modulos/comandas/conferencia');
    expect(k).toBe('COMMANDS');
  });

  it('devolve nulo para telas fora do mapa (elas têm regra própria)', () => {
    expect(moduleOfPath('/perfil')).toBeNull();
    expect(moduleOfPath('/notificacoes')).toBeNull();
    expect(moduleOfPath('/termo')).toBeNull();
  });

  it('não casa por prefixo parcial de nome', () => {
    // "/modulos/comandas-outro" NÃO é do módulo Comandas
    expect(moduleOfPath('/modulos/comandas-outro')).toBeNull();
  });
});
