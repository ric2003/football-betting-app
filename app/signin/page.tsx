import { SignInForm } from "../ui/signin-form";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f2] px-4 py-10 text-[#18201b] sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#16735f]">
              Mundial Bet 2026
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-[#13251f] sm:text-6xl">
              Apostas do Mundial com a tua liga de amigos.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#52605a]">
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
