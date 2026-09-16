'use client';

import { useState } from 'react';
import { Check, Plus, Send, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { emBR, MSG_DUPLICADO, TAMANHOS, totalDePizzas, type TamanhoPizza } from '@/lib/pizzas/tipos';

interface Sabor {
  id: string;
  name: string;
}
interface LinhaSalva {
  size: string;
  flavorId: string;
  quantity: number;
}
interface Linha {
  size: TamanhoPizza;
  flavorId: string;
  /** Texto enquanto digita — vira número só no envio. */
  quantity: string;
}

const LINHA_VAZIA: Linha = { size: 'CM35', flavorId: '', quantity: '' };

const paraLinhas = (itens: LinhaSalva[]): Linha[] =>
  itens.map((i) => ({ size: i.size as TamanhoPizza, flavorId: i.flavorId, quantity: String(i.quantity) }));

/**
 * Fechamento de pizzas pelo link interno — SEM login.
 *
 * A unidade não aparece como campo, nem como texto editável: ela vem do token
 * da URL e é resolvida no servidor. Quem abre o link preenche o que vendeu, e
 * nada mais.
 */
export function PizzaPublicForm({
  token,
  unitName,
  hoje,
  flavors,
  fechamentoDeHoje,
}: {
  token: string;
  unitName: string;
  hoje: string;
  flavors: Sabor[];
  fechamentoDeHoje: { items: LinhaSalva[]; observation: string | null } | null;
}) {
  const [data, setData] = useState(hoje);
  const [linhas, setLinhas] = useState<Linha[]>([{ ...LINHA_VAZIA }]);
  const [observation, setObservation] = useState('');
  const [substituir, setSubstituir] = useState(false);
  const [duplicado, setDuplicado] = useState(fechamentoDeHoje !== null);
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ total: number; corrigido: boolean } | null>(null);

  const opcoesDeSabor = flavors.map((f) => ({ value: f.id, label: f.name }));
  const opcoesDeTamanho = TAMANHOS.map((t) => ({ value: t.valor, label: t.rotulo }));

  const total = totalDePizzas(linhas.map((l) => ({ quantity: parseInt(l.quantity, 10) || 0 })));

  function alterar(i: number, campo: Partial<Linha>) {
    setLinhas((s) => s.map((l, j) => (j === i ? { ...l, ...campo } : l)));
  }

  /** Troca de data: consulta o servidor antes de deixar digitar por cima. */
  async function trocarData(nova: string) {
    setData(nova);
    setErro(null);
    setPronto(null);
    setSubstituir(false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nova)) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/pizzas?token=${encodeURIComponent(token)}&data=${nova}`);
      const d = await res.json().catch(() => ({}));
      setDuplicado(Boolean(d?.closing));
    } catch {
      setDuplicado(false);
    } finally {
      setCarregando(false);
    }
  }

  /** Traz o que já foi lançado para a tela, para a correção ser sobre o real. */
  async function carregarParaCorrigir() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/pizzas?token=${encodeURIComponent(token)}&data=${data}`);
      const d = await res.json().catch(() => ({}));
      if (d?.closing?.items?.length) {
        setLinhas(paraLinhas(d.closing.items));
        setObservation(d.closing.observation ?? '');
        setSubstituir(true);
      } else {
        setErro('Não foi possível carregar o fechamento desta data.');
      }
    } catch {
      setErro('Falha de conexão');
    } finally {
      setCarregando(false);
    }
  }

  async function enviar() {
    setErro(null);
    const items = linhas
      .filter((l) => l.flavorId && (parseInt(l.quantity, 10) || 0) > 0)
      .map((l) => ({ size: l.size, flavorId: l.flavorId, quantity: parseInt(l.quantity, 10) }));
    if (items.length === 0) {
      setErro('Informe ao menos um sabor com quantidade.');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/api/pizzas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, operationalDate: data, items, observation, substituir }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPronto({ total: d.total ?? total, corrigido: Boolean(d.substituiu) });
        return;
      }
      if (d?.reason === 'DUPLICADO') {
        setDuplicado(true);
        setErro(null);
        return;
      }
      setErro(d?.error ?? 'Não foi possível enviar o fechamento.');
    } catch {
      setErro('Falha de conexão');
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div className="rounded-card bg-surface p-6 text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <Check className="h-8 w-8 text-success" />
        </div>
        <p className="text-lg font-bold text-ink-900">
          {pronto.corrigido ? 'Fechamento corrigido!' : 'Fechamento enviado!'}
        </p>
        <p className="text-sm text-ink-500">
          {pronto.total} {pronto.total === 1 ? 'pizza registrada' : 'pizzas registradas'} em {emBR(data)}.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setPronto(null);
            setLinhas([{ ...LINHA_VAZIA }]);
            setObservation('');
            setSubstituir(false);
            trocarData(data);
          }}
        >
          Lançar outra data
        </Button>
      </div>
    );
  }

  if (flavors.length === 0) {
    return (
      <Banner
        tone="warning"
        title="Nenhum sabor cadastrado"
        description={`A pizzaria de ${unitName} ainda não tem sabores no catálogo. Peça ao gerente para cadastrá-los no SGO.`}
      />
    );
  }

  return (
    <div className="space-y-4 rounded-card bg-surface p-4">
      <Input
        label="Data do fechamento"
        type="date"
        max={hoje}
        value={data}
        onChange={(e) => trocarData(e.target.value)}
      />

      {duplicado && !substituir && (
        <Banner
          tone="warning"
          title={MSG_DUPLICADO}
          description="Para corrigir, carregue o que já foi lançado e ajuste os números. O gerente é avisado da correção."
          action={
            <Button size="sm" variant="secondary" loading={carregando} onClick={carregarParaCorrigir}>
              Carregar e corrigir
            </Button>
          }
        />
      )}

      {substituir && (
        <Banner
          tone="info"
          title="Você está corrigindo um fechamento já enviado"
          description="Ao enviar, os números abaixo substituem os anteriores desta data."
        />
      )}

      <div className="space-y-3">
        {linhas.map((l, i) => (
          /* EMPILHADO, não em linha única. Mobile-first é o padrão do SGO e
             este formulário é preenchido no celular, no fim do turno: com os
             quatro controles lado a lado em 375px o sabor cabia em duas letras
             ("Frango com Catupiry" virava "F..") e ninguém conferia o que tinha
             lançado. O sabor ocupa a linha inteira; tamanho e quantidade, que
             são curtos e se explicam sozinhos, dividem a de baixo. */
          <div key={i} className="space-y-2 rounded-card border border-line p-3">
            <Select
              label={i === 0 ? 'Sabor' : undefined}
              aria-label={`Sabor da linha ${i + 1}`}
              placeholder="Escolha o sabor"
              options={opcoesDeSabor}
              value={l.flavorId || null}
              onValueChange={(v) => alterar(i, { flavorId: v })}
            />
            <div className="flex items-end gap-2">
              <div className="w-28 shrink-0">
                <Select
                  label={i === 0 ? 'Tamanho' : undefined}
                  aria-label={`Tamanho da linha ${i + 1}`}
                  options={opcoesDeTamanho}
                  value={l.size}
                  onValueChange={(v) => alterar(i, { size: v as TamanhoPizza })}
                />
              </div>
              <div className="w-20 shrink-0">
                <Input
                  label={i === 0 ? 'Qtd' : undefined}
                  aria-label={`Quantidade da linha ${i + 1}`}
                  inputMode="numeric"
                  placeholder="0"
                  className="text-right tabular-nums"
                  value={l.quantity}
                  onChange={(e) => alterar(i, { quantity: e.target.value.replace(/\D/g, '') })}
                />
              </div>
              <div className="flex-1" />
              <IconButton
                variant="danger"
                className="shrink-0"
                aria-label={`Remover linha ${i + 1}`}
                onClick={() => setLinhas((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s))}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setLinhas((s) => [...s, { ...LINHA_VAZIA }])}>
        <Plus className="h-4 w-4" /> Adicionar sabor
      </Button>

      {/* O total antes do envio: quem fecha o caixa confere aqui, não de cabeça. */}
      <div className="flex items-baseline justify-between rounded-card border-2 border-brand/30 bg-brand/5 px-3 py-2">
        <span className="text-xs font-semibold text-brand">Total de pizzas</span>
        <span className="sgo-type-24 font-bold tabular-nums text-brand">{total}</span>
      </div>

      <Input
        label="Observação (opcional)"
        value={observation}
        onChange={(e) => setObservation(e.target.value)}
        placeholder="Ex.: promoção de terça"
      />

      {erro && <Banner tone="danger" title={erro} />}

      <Button
        size="lg"
        className="w-full"
        loading={enviando}
        disabled={duplicado && !substituir}
        onClick={enviar}
      >
        <Send className="h-5 w-5" /> Enviar fechamento
      </Button>
    </div>
  );
}
