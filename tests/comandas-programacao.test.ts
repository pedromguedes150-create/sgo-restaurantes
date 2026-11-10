import { describe, it, expect } from 'vitest';
import {
  escolherProgramacao, normalizarProgramacao, normalizarExcecao, noTurno, diaDaSemana, rotuloDosDias, numerosDaProgramacao,
  type Programacao, type Excecao,
} from '@/lib/commands/programacao';

/**
 * v1.201.0 — programação das conferências: Seg–Sex 1–300, Sáb/Dom 1–500,
 * completa 1–700 num dia da semana, turno, prioridade e exceção por data.
 */

const P = (o: Partial<Programacao> & { id: string }): Programacao => ({
  nome: o.id, tipo: 'FAIXA_DO_DIA', dias: [1, 2, 3, 4, 5], inicioHora: null, fimHora: null, faixaDe: 1, faixaAte: 300, prioridade: 0, ativa: true, ...o,
});

// 2026-11-09 é segunda; 2026-11-14 sábado; 2026-11-15 domingo.
const SEG = '2026-11-09';
const SAB = '2026-11-14';
const DOM = '2026-11-15';

const semana = P({ id: 'a-semana', nome: 'Semana', dias: [1, 2, 3, 4, 5], faixaDe: 1, faixaAte: 300 });
const fds = P({ id: 'b-fds', nome: 'Fim de semana', dias: [6, 0], faixaDe: 1, faixaAte: 500 });
const completa = P({ id: 'c-completa', nome: 'Completa semanal', tipo: 'COMPLETA', dias: [0], faixaDe: null, faixaAte: null });

describe('dia da semana e turno', () => {
  it('calcula o dia da semana de uma data', () => {
    expect(diaDaSemana(SEG)).toBe(1);
    expect(diaDaSemana(SAB)).toBe(6);
    expect(diaDaSemana(DOM)).toBe(0);
  });
  it('turno do dia todo, comum e que cruza a meia-noite', () => {
    expect(noTurno(3, null, null)).toBe(true);
    expect(noTurno(12, 11, 15)).toBe(true);
    expect(noTurno(15, 11, 15)).toBe(false); // fim exclusivo
    expect(noTurno(23, 22, 4)).toBe(true);
    expect(noTurno(2, 22, 4)).toBe(true);
    expect(noTurno(10, 22, 4)).toBe(false);
  });
  it('rótulo dos dias', () => {
    expect(rotuloDosDias([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(rotuloDosDias([6, 0])).toBe('Sáb e Dom');
    expect(rotuloDosDias([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(rotuloDosDias([1, 3, 5])).toBe('Seg, Qua e Sex');
  });
});

describe('escolher a programação do dia', () => {
  const base = { programacoes: [semana, fds, completa], excecao: null, hora: 12 };

  it('semana usa 1–300; sábado 1–500; domingo vence a completa (mais ampla) sobre a faixa', () => {
    const s = escolherProgramacao({ ...base, data: SEG });
    expect(s.origem).toBe('PROGRAMACAO');
    expect(s.faixa).toEqual({ de: 1, ate: 300 });
    expect(escolherProgramacao({ ...base, data: SAB }).faixa).toEqual({ de: 1, ate: 500 });
    const d = escolherProgramacao({ ...base, data: DOM });
    expect(d.tipo).toBe('COMPLETA');
    expect(d.concorrentes).toEqual(['Fim de semana']); // sobreposição permitida e dita
  });

  it('prioridade maior vence mesmo contra a completa', () => {
    const forte = P({ id: 'z', nome: 'Forte', dias: [0], faixaDe: 1, faixaAte: 100, prioridade: 5 });
    expect(escolherProgramacao({ ...base, programacoes: [fds, completa, forte], data: DOM }).nome).toBe('Forte');
  });

  it('turno definido vence o dia todo; fora do turno cai no outro', () => {
    const noite = P({ id: 'n', nome: 'Noite', dias: [1], inicioHora: 18, fimHora: 23, faixaDe: 1, faixaAte: 50 });
    const ps = [semana, noite];
    expect(escolherProgramacao({ programacoes: ps, excecao: null, data: SEG, hora: 19 }).nome).toBe('Noite');
    expect(escolherProgramacao({ programacoes: ps, excecao: null, data: SEG, hora: 10 }).nome).toBe('Semana');
  });

  it('programação inativa é ignorada; sem nenhuma, vale o padrão', () => {
    expect(escolherProgramacao({ programacoes: [{ ...semana, ativa: false }], excecao: null, data: SEG, hora: 12 }).origem).toBe('PADRAO');
    expect(escolherProgramacao({ programacoes: [semana], excecao: null, data: DOM, hora: 12 }).origem).toBe('PADRAO');
  });

  it('exceção por data vence tudo: faixa própria, completa ou sem conferência', () => {
    const ex = (o: Partial<Excecao>): Excecao => ({ id: 'e', data: SEG, nome: 'Feriado', semConferencia: false, tipo: null, faixaDe: null, faixaAte: null, ...o });
    const f = escolherProgramacao({ ...base, data: SEG, excecao: ex({ tipo: 'FAIXA_DO_DIA', faixaDe: 1, faixaAte: 80 }) });
    expect(f.origem).toBe('EXCECAO');
    expect(f.faixa).toEqual({ de: 1, ate: 80 });
    expect(escolherProgramacao({ ...base, data: SEG, excecao: ex({ tipo: 'COMPLETA' }) }).tipo).toBe('COMPLETA');
    const skip = escolherProgramacao({ ...base, data: SEG, excecao: ex({ semConferencia: true }) });
    expect(skip.semConferencia).toBe(true);
    expect(skip.tipo).toBeNull();
  });

  it('é determinístico: a ordem de entrada não muda o vencedor', () => {
    const a = P({ id: 'a', nome: 'A', dias: [1] });
    const b = P({ id: 'b', nome: 'B', dias: [1] });
    expect(escolherProgramacao({ programacoes: [b, a], excecao: null, data: SEG, hora: 9 }).nome).toBe('A');
  });
});

describe('números da programação dentro do cadastro', () => {
  it('só os cadastrados da faixa; completa = sequência inteira (nulo)', () => {
    const cadastro = [1, 2, 3, 10, 400];
    const f = escolherProgramacao({ programacoes: [semana], excecao: null, data: SEG, hora: 9 });
    expect(numerosDaProgramacao(f, cadastro)).toEqual([1, 2, 3, 10]);
    const c = escolherProgramacao({ programacoes: [completa], excecao: null, data: DOM, hora: 9 });
    expect(numerosDaProgramacao(c, cadastro)).toBeNull();
  });
});

describe('validação', () => {
  const cad = new Set([1, 2, 3, 4, 5]);
  const ok = { nome: 'Semana', tipo: 'FAIXA_DO_DIA', dias: [1, 2], faixaDe: 1, faixaAte: 3 };
  it('aceita e normaliza', () => {
    const r = normalizarProgramacao(ok, cad);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toMatchObject({ dias: [1, 2], inicioHora: null, fimHora: null, prioridade: 0 });
  });
  it('recusa nome, tipo, dias, turno meio preenchido, faixa invertida e faixa sem comandas cadastradas', () => {
    expect(normalizarProgramacao({ ...ok, nome: '' }, cad)).toMatchObject({ ok: false, motivo: 'NOME' });
    expect(normalizarProgramacao({ ...ok, tipo: 'X' }, cad)).toMatchObject({ ok: false, motivo: 'TIPO' });
    expect(normalizarProgramacao({ ...ok, dias: [] }, cad)).toMatchObject({ ok: false, motivo: 'DIAS' });
    expect(normalizarProgramacao({ ...ok, inicioHora: 8 }, cad)).toMatchObject({ ok: false, motivo: 'TURNO' });
    expect(normalizarProgramacao({ ...ok, inicioHora: 8, fimHora: 25 }, cad)).toMatchObject({ ok: false, motivo: 'TURNO' });
    expect(normalizarProgramacao({ ...ok, faixaDe: 5, faixaAte: 2 }, cad)).toMatchObject({ ok: false, motivo: 'FAIXA' });
    expect(normalizarProgramacao({ ...ok, faixaDe: 900, faixaAte: 950 }, cad)).toMatchObject({ ok: false, motivo: 'SEM_COMANDAS' });
  });
  it('completa não guarda faixa', () => {
    const r = normalizarProgramacao({ nome: 'Completa', tipo: 'COMPLETA', dias: [0], faixaDe: 1, faixaAte: 9 }, cad);
    expect(r.ok && r.valor.faixaDe).toBeNull();
  });
  it('exceção: data válida, motivo, e ou sem conferência ou tipo', () => {
    expect(normalizarExcecao({ data: '2026-13-40', nome: 'x' }, cad)).toMatchObject({ ok: false, motivo: 'DATA' });
    expect(normalizarExcecao({ data: SEG, nome: '' }, cad)).toMatchObject({ ok: false, motivo: 'NOME' });
    expect(normalizarExcecao({ data: SEG, nome: 'Feriado', semConferencia: true }, cad)).toMatchObject({ ok: true });
    expect(normalizarExcecao({ data: SEG, nome: 'Evento', tipo: 'COMPLETA' }, cad)).toMatchObject({ ok: true });
  });
});
