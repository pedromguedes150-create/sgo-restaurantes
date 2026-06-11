import { redirect } from 'next/navigation';

// A aba "Pessoas" do bottom-nav leva ao módulo de Gestão de Pessoas.
export default function PessoasRedirect() {
  redirect('/modulos/pessoas');
}
