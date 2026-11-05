import { Check, LockKeyhole, MessageCircle, Smartphone, Waypoints } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const foundations = [
  { icon: LockKeyhole, title: "Privacidade desde a base", description: "Seus dados ficam isolados por usuário e a conexão com o banco é feita pela Pluggy, sem guardar sua senha." },
  { icon: MessageCircle, title: "Direto no WhatsApp", description: "Mande “gastei 45 no mercado” e receba avisos de contas e assinaturas antes do vencimento." },
  { icon: Smartphone, title: "Pensado para o celular", description: "Uma experiência simples para acompanhar o que importa, em qualquer tela." },
];

export default function Home() {
  return (
    <main className="relative isolate min-h-svh overflow-hidden px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-20 -z-10 h-80 w-80 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-700/15" />
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2.5" aria-label="Prumo">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-800 text-white shadow-sm dark:bg-emerald-400 dark:text-emerald-950"><Waypoints aria-hidden="true" size={21} strokeWidth={2.5} /></span>
            <span className="text-xl font-semibold tracking-tight">prumo<span className="text-emerald-700 dark:text-emerald-400">.</span></span>
          </div>
          <Button asChild variant="ghost" size="sm"><Link href="/login">Entrar</Link></Button>
        </header>

        <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_0.8fr] lg:items-center lg:gap-16" aria-labelledby="hero-title">
          <div className="max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"><span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" /> Finanças com os pés no chão</p>
            <h1 id="hero-title" className="text-balance text-4xl font-semibold leading-[1.12] tracking-tight sm:text-6xl">Clareza para cuidar do seu dinheiro.</h1>
            <p className="mt-6 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">Entradas e saídas com tags automáticas, contas futuras, assinaturas detectadas e um assistente no WhatsApp. Tudo pensado para o celular.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild className="min-h-11 w-full sm:w-auto"><Link href="/signup">Criar conta grátis</Link></Button>
              <Button size="lg" asChild variant="outline" className="min-h-11 w-full sm:w-auto"><Link href="/login">Já tenho conta</Link></Button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-sm rounded-[2rem] border border-border bg-card p-5 shadow-[0_24px_80px_-35px_rgba(21,70,52,.35)] sm:p-6" aria-label="Prévia conceitual do produto">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-medium uppercase tracking-[.16em] text-muted-foreground">Como funciona</p><h2 className="mt-2 text-xl font-semibold">Tudo no seu ritmo</h2></div>
              <span className="rounded-full bg-emerald-100 p-2 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"><Check aria-hidden="true" size={20} /></span>
            </div>
            <div className="mt-7 space-y-3">
              {[
                ["01", "Entenda seu mês", "Entradas, saídas e gráficos por tag"],
                ["02", "Antecipe compromissos", "Contas e assinaturas antes do vencimento"],
                ["03", "Mantenha o histórico", "Banco, app ou WhatsApp, cada uma com sua origem"],
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-4 rounded-2xl border border-border/70 bg-background/80 p-4">
                  <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">{number}</span>
                  <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p></div>
                </div>
              ))}
            </div>
            
          </div>
        </section>

        <section className="border-t border-border py-10 sm:py-14" aria-labelledby="foundations-title">
          <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-800 dark:text-emerald-300">Nossa base</p><h2 id="foundations-title" className="mt-2 text-2xl font-semibold tracking-tight">Construído com cuidado desde o começo</h2></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {foundations.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-border bg-card/70 p-5">
                <Icon aria-hidden="true" className="text-emerald-700 dark:text-emerald-400" size={23} />
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="border-t border-border py-6 text-sm text-muted-foreground">Prumo · finanças com clareza.</footer>
      </div>
    </main>
  );
}
