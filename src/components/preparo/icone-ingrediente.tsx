'use client';

import * as React from 'react';
import {
  Apple, Beef, Candy, Carrot, Cherry, Coffee, CookingPot, Croissant, CupSoda, Drumstick, Egg, Fish,
  Leaf, Milk, Package, Droplets, Utensils, Wheat, type LucideIcon,
} from 'lucide-react';
import { normalizar } from '@/lib/products/busca';

/**
 * Um ícone por ingrediente, escolhido pelo NOME. É acabamento (a referência do
 * Pedro mostra um desenho ao lado de cada item), não dado: nada é gravado e
 * nome fora da lista cai num talher neutro. A ordem importa — "pão de queijo"
 * é pão antes de ser queijo.
 */
const REGRAS: [string[], LucideIcon][] = [
  [['pao', 'bisnaga', 'brioche', 'baguete', 'torrada', 'massa', 'farinha', 'trigo'], Wheat],
  [['croissant', 'folhado', 'salgado', 'coxinha', 'empada', 'pastel', 'bolo', 'biscoito'], Croissant],
  [['ovo'], Egg],
  [['linguica', 'carne', 'bife', 'hamburguer', 'bacon', 'presunto', 'salame', 'mortadela', 'calabresa', 'picanha', 'costela'], Beef],
  [['frango', 'coxa', 'peito', 'peru'], Drumstick],
  [['peixe', 'atum', 'salmao', 'sardinha', 'camarao'], Fish],
  [['queijo', 'requeijao', 'leite', 'manteiga', 'creme', 'iogurte', 'nata', 'catupiry', 'mussarela', 'muçarela', 'cheddar'], Milk],
  [['alface', 'rucula', 'folha', 'couve', 'espinafre', 'salsa', 'cebolinha', 'manjericao', 'oregano', 'hortela'], Leaf],
  [['tomate', 'morango', 'cereja', 'pimenta'], Cherry],
  [['cenoura', 'batata', 'cebola', 'pepino', 'abobrinha', 'milho', 'beterraba'], Carrot],
  [['maca', 'banana', 'abacaxi', 'uva', 'laranja', 'limao', 'fruta', 'goiaba', 'manga'], Apple],
  [['acucar', 'doce', 'chocolate', 'bala', 'granulado', 'mel', 'leite condensado'], Candy],
  [['cafe', 'cha'], Coffee],
  [['refrigerante', 'suco', 'agua', 'bebida', 'gelo'], CupSoda],
  [['molho', 'maionese', 'ketchup', 'mostarda', 'azeite', 'oleo', 'vinagre', 'caldo'], Droplets],
  [['saco', 'embalagem', 'papel', 'forminha', 'guardanapo', 'copo', 'tampa', 'caixa', 'pote', 'palito', 'canudo', 'filme'], Package],
  [['arroz', 'feijao', 'sopa', 'caldo', 'macarrao', 'farofa', 'pure'], CookingPot],
];

export function iconeDoIngrediente(nome: string): LucideIcon {
  const n = normalizar(nome);
  for (const [termos, Icone] of REGRAS) if (termos.some((t) => n.includes(t))) return Icone;
  return Utensils;
}

export function IconeIngrediente({ nome, className }: { nome: string; className?: string }) {
  const Icone = iconeDoIngrediente(nome);
  return (
    <span aria-hidden className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-tint text-brand', className].filter(Boolean).join(' ')}>
      <Icone className="h-4 w-4" />
    </span>
  );
}
