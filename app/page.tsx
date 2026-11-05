import Link from "next/link";

import { ChatIcon, HomeIcon, PrumoLogo, PrumoSymbol, RepeatIcon } from "@/components/app/icons";
import { Button } from "@/components/ui/button";

// Copy from the "01 Marca" board: the plumb line, and three principles.
const principles = [
  { n: "01", title: "Clareza antes de tudo", text: "Um número por vez. Se não ajuda a decidir, sai da tela." },
  { n: "02", title: "Equilíbrio, não vigilância", text: "O que é de cada um e o que é do casal, sem placar e sem culpa." },
  { n: "03", title: "Calma como padrão", text: "Muito espaço, pouca cor, alertas raros. Dinheiro já gera ruído suficiente." },
];

const features = [
  { icon: HomeIcon, title: "Seu mês em um lugar", text: "Entradas e saídas com tags automáticas, contas futuras e gráficos por tag." },
  { icon: RepeatIcon, title: "Assinaturas sob controle", text: "O Prumo encontra cobranças repetidas e avisa antes de cada uma." },
  { icon: ChatIcon, title: "Direto no WhatsApp", text: "Mande “gastei 45 no mercado” e receba avisos de contas antes do vencimento." },
];

export default function Home() {
  return (
    <main className="min-h-svh px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3 py-3">
          <PrumoLogo />
          <Button asChild variant="ghost" size="sm"><Link href="/login" className="no-underline">Entrar</Link></Button>
        </header>

        <section className="grid gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-20" aria-labelledby="hero-title">
          <div className="flex max-w-xl flex-col gap-6">
            <span className="label-mono">Finanças pessoais e do casal</span>
            <h1 id="hero-title" className="text-balance text-[40px] font-medium leading-[1.08] tracking-[-0.03em] sm:text-[56px]">Finanças a dois, no prumo.</h1>
            <p className="max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
              O prumo é o fio com peso que encontra a vertical. Para o casal, é o ponto de equilíbrio: duas vidas financeiras distintas, alinhadas na mesma direção.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto"><Link href="/signup" className="no-underline hover:text-primary-foreground">Criar conta grátis</Link></Button>
              <Button asChild variant="outline" className="w-full sm:w-auto"><Link href="/login" className="no-underline hover:text-foreground">Já tenho conta</Link></Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-[10px] bg-primary">
                <PrumoSymbol className="h-9 w-7" color="#ffffff" />
              </span>
              <span className="label-mono">Princípios</span>
            </div>
            <ol className="m-0 list-none p-0">
              {principles.map((p) => (
                <li key={p.n} className="grid grid-cols-[40px_1fr] gap-y-1 border-t border-border py-4 last:border-b">
                  <span className="font-mono text-[13px] text-muted-foreground">{p.n}</span>
                  <span className="text-lg font-medium">{p.title}</span>
                  <span className="col-start-2 text-[15px] leading-[22px] text-muted-foreground">{p.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border py-10 sm:py-14" aria-labelledby="features-title">
          <h2 id="features-title" className="mb-7 text-2xl font-medium tracking-[-0.015em]">O que o Prumo faz hoje</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-border bg-card p-6">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary"><Icon className="size-5" /></span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="flex items-center gap-2 border-t border-border py-6 text-sm text-muted-foreground">
          <PrumoSymbol className="h-4 w-3" color="var(--muted-foreground)" /> Prumo · finanças a dois, no prumo.
        </footer>
      </div>
    </main>
  );
}
