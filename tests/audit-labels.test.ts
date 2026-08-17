import { describe, it, expect } from 'vitest';
import { describeAction, moduleLabel } from '@/lib/audit-labels';

describe('Auditoria — rótulos em PT-BR', () => {
  it('traduz módulos e mantém o código quando não conhece', () => {
    expect(moduleLabel('PAYMENTS')).toBe('Pagamentos');
    expect(moduleLabel('CASH')).toBe('Troco');
    expect(moduleLabel(null)).toBe('—');
    expect(moduleLabel('MODULO_NOVO')).toBe('MODULO_NOVO');
  });

  it('compõe entidade + verbo', () => {
    expect(describeAction('PAYMENT_APPROVE')).toEqual({ label: 'Pagamento — aprovação', group: 'DECISAO' });
    expect(describeAction('UNIT_CREATE')).toEqual({ label: 'Unidade — criação', group: 'CRIACAO' });
    expect(describeAction('WASTE_DELETE')).toEqual({ label: 'Desperdício — exclusão', group: 'EXCLUSAO' });
    expect(describeAction('POP_PUBLISH')).toEqual({ label: 'POP — publicação', group: 'CONCLUSAO' });
  });

  it('prefere a entidade MAIS específica (prefixos que se sobrepõem)', () => {
    // CASH_BUCKET_SET não pode cair em "CASH"; COMMAND_SEQ não pode virar "Comanda".
    expect(describeAction('CASH_BUCKET_SET').label).toBe('Balde do cofre — definição');
    expect(describeAction('COMMAND_SEQ_UPDATE').label).toBe('Sequência de comandas — edição');
    expect(describeAction('OCC_TYPE_DELETE').label).toBe('Tipo de ocorrência — exclusão');
    expect(describeAction('CHECKLIST_MODEL_IMPORT').label).toBe('Modelo de checklist — importação');
    expect(describeAction('FREELANCER_SECTOR_RATE_SET').label).toBe('Valor do freelancer por setor — definição');
  });

  it('trata as ações que não seguem entidade_verbo', () => {
    expect(describeAction('LOGIN').label).toBe('Entrada no sistema');
    expect(describeAction('LOGIN_FAILED').label).toBe('Tentativa de entrada recusada');
    expect(describeAction('RH_SYNC_AUTO').label).toBe('Sincronização automática do RH');
    expect(describeAction('DEALLOCATE').label).toBe('Remoção do mapa de funções');
  });

  it('ação desconhecida vira texto legível, nunca o código cru', () => {
    const r = describeAction('COISA_NOVA_QUALQUER');
    expect(r.label).toBe('Coisa nova qualquer');
    expect(r.group).toBe('OUTROS');
  });

  it('agrupa por tipo de ação para alimentar o filtro', () => {
    expect(describeAction('USER_DELETE').group).toBe('EXCLUSAO');
    expect(describeAction('VISIT_DONE').group).toBe('CONCLUSAO');
    // LGPD: consulta a anexo sensível precisa ser filtrável como CONSULTA.
    expect(describeAction('OCC_VIEW_ATTACHMENTS')).toEqual({ label: 'Ocorrência — consulta de anexos', group: 'CONSULTA' });
    expect(describeAction('TEMPLATE_UPDATE').group).toBe('EDICAO');
  });
});
