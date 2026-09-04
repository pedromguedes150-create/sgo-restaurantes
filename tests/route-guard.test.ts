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

  it('mapeia as telas internas na PARTE dona, não no módulo pai', () => {
    /* O contrato mudou de propósito na v1.65.0: cada tela interna virou uma
       parte própria na matriz, para poder ser liberada ou fechada sozinha.
       Quem não tem chave própria continua caindo no dono mais próximo. */
    expect(moduleOfPath('/modulos/comandas/conferencia')).toBe('COMMANDS_SCAN');
    expect(moduleOfPath('/modulos/comandas/analise-aberto/consolidado')).toBe('COMMANDS_OPEN');
    expect(moduleOfPath('/modulos/atestados/relatorio')).toBe('CERTIFICATES_REPORT');
    expect(moduleOfPath('/configuracoes/usuarios')).toBe('CONFIG_USERS');
    // sem chave própria: fica com o pai
    expect(moduleOfPath('/modulos/ocorrencias/qualquer-coisa')).toBe('OCCURRENCES');
  });

  it('não confunde módulos de nome parecido', () => {
    // /modulos/notas/gas é a análise de gás DENTRO de Notas, não o módulo Gás
    expect(moduleOfPath('/modulos/notas/gas')).toBe('NOTES_GAS');
    expect(moduleOfPath('/modulos/gas')).toBe('GAS');
  });

  it('escolhe sempre o caminho MAIS ESPECÍFICO', () => {
    // com parte e módulo disputando o mesmo prefixo, a parte é que manda —
    // senão a tela cairia no módulo pai e a restrição não valeria
    expect(moduleOfPath('/modulos/escala')).toBe('SCHEDULE');
    expect(moduleOfPath('/modulos/escala/folgas')).toBe('SCHEDULE_OFF');
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
