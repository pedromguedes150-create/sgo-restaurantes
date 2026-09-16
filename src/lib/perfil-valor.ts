/**
 * Como um perfil PERSONALIZADO é identificado no seletor de perfis.
 *
 * Módulo PURO de propósito. Estas constantes moravam em `admin-client.ts`, que
 * é `'use client'` — e a página de Perfis, que é de servidor, montava o valor
 * com elas. Um componente de servidor não recebe o VALOR de um export de módulo
 * cliente, e sim uma referência: o `value` saía corrompido, o id chegava
 * truncado na API e toda gravação voltava "Dados inválidos". Sem erro de
 * compilação e sem nada no console além do 400.
 */

export const PREFIXO_PERFIL = 'perfil:';

export const ehPerfilPersonalizado = (valor: string) => valor.startsWith(PREFIXO_PERFIL);

export const idDoPerfil = (valor: string) => valor.slice(PREFIXO_PERFIL.length);

/** O valor de seletor para um perfil personalizado. */
export const valorDePerfil = (id: string) => `${PREFIXO_PERFIL}${id}`;
