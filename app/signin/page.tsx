import { SignInForm } from "../ui/signin-form";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f2] px-4 py-10 text-[#18201b] transition-colors dark:bg-background dark:text-foreground sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <AnimatedThemeToggler
          aria-label="Alternar modo escuro"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d7ded3] bg-white text-[#16735f] transition hover:bg-[#eef2eb] dark:border-border dark:bg-secondary dark:text-foreground dark:hover:bg-accent [&_svg]:h-4 [&_svg]:w-4"
          variant="circle"
        />
      </div>
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#16735f] dark:text-primary">
              World Cup Bets 2026
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-[#13251f] dark:text-foreground sm:text-6xl">
              Apostas do Mundial com os teus amigos.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#52605a] dark:text-muted-foreground">
              Faz previsoes jogo a jogo, acompanha os pontos em direto e decide
              quem tem mais faro de selecionador.
            </p>
          </div>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}
