"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  MailCheck,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "signIn" | "signUp" | "reset";
type ResetStep = "request" | "verify";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [resetStep, setResetStep] = useState<ResetStep>("request");
  const [resetEmail, setResetEmail] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const usernameMessage =
    mode === "signUp" && username.trim().length > 0 && username.trim().length < 3
      ? "Usa pelo menos 3 caracteres."
      : "";

  function chooseMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    if (nextMode !== "reset") {
      setResetStep("request");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);

    try {
      const formData = new FormData(event.currentTarget);

      if (mode === "reset") {
        if (resetStep === "request") {
          const email = String(formData.get("email") ?? "").trim().toLowerCase();
          formData.set("email", email);
          formData.set("flow", "reset");
          await signIn("password", formData);
          setResetEmail(email);
          setResetStep("verify");
          setMessage("Enviámos um código para o teu email.");
          return;
        }

        formData.set("email", resetEmail);
        formData.set("flow", "reset-verification");
        await signIn("password", formData);
        router.replace("/");
        return;
      }

      formData.set("flow", mode);

      if (mode === "signUp") {
        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 3) {
          throw new Error("O username deve ter pelo menos 3 caracteres.");
        }
        formData.set("username", trimmedUsername);
      }

      await signIn("password", formData);
      router.replace("/");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possivel autenticar. Tenta novamente.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[#d7ded3] bg-white p-6 shadow-sm transition-colors dark:border-border dark:bg-card"
    >
      {mode === "reset" ? (
        <button
          type="button"
          onClick={() => chooseMode("signIn")}
          className="mb-6 flex h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-[#52605a] transition hover:bg-[#eef2eb] hover:text-[#18201b] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Voltar ao login
        </button>
      ) : (
        <div className="mb-6 flex rounded-md border border-[#dfe5dc] bg-[#f6f7f2] p-1 transition-colors dark:border-border dark:bg-secondary">
          <button
            type="button"
            onClick={() => chooseMode("signIn")}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
              mode === "signIn"
                ? "bg-[#16735f] text-white"
                : "text-[#52605a] hover:text-[#18201b] dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <LogIn size={16} />
            Entrar
          </button>
          <button
            type="button"
            onClick={() => chooseMode("signUp")}
            className={`flex h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
              mode === "signUp"
                ? "bg-[#16735f] text-white"
                : "text-[#52605a] hover:text-[#18201b] dark:text-muted-foreground dark:hover:text-foreground"
            }`}
          >
            <UserPlus size={16} />
            Registar
          </button>
        </div>
      )}

      <div className="space-y-4">
        {mode === "reset" ? (
          <>
            <div>
              <h2 className="text-xl font-semibold text-[#13251f] dark:text-foreground">
                Repor password
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#52605a] dark:text-muted-foreground">
                {resetStep === "request"
                  ? "Indica o email da conta e enviamos um código de recuperação."
                  : `Introduz o código enviado para ${resetEmail}.`}
              </p>
            </div>

            {resetStep === "request" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#26332d] dark:text-foreground">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  className="mt-2 h-11 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30"
                  placeholder="exemplo@email.com"
                  autoComplete="email"
                  required
                />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="text-sm font-medium text-[#26332d] dark:text-foreground">
                    Código
                  </span>
                  <input
                    name="code"
                    inputMode="numeric"
                    className="mt-2 h-11 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30"
                    placeholder="12345678"
                    autoComplete="one-time-code"
                    required
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-[#26332d] dark:text-foreground">
                    Nova password
                  </span>
                  <span className="mt-2 flex h-11 items-center rounded-md border border-[#d7ded3] bg-white pr-2 ring-[#16735f]/20 transition focus-within:border-[#16735f] focus-within:ring-4 dark:border-border dark:bg-input/30">
                    <input
                      name="newPassword"
                      type={showPassword ? "text" : "password"}
                      className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 outline-none"
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="flex h-8 w-8 items-center justify-center rounded text-[#52605a] hover:bg-[#eef2eb] dark:text-muted-foreground dark:hover:bg-accent"
                      aria-label={showPassword ? "Esconder password" : "Mostrar password"}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
              </>
            )}
          </>
        ) : mode === "signUp" ? (
          <label className="block">
            <span className="text-sm font-medium text-[#26332d] dark:text-foreground">
              Username
            </span>
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30"
              placeholder="Ricardo Piedade"
              autoComplete="username"
              required
            />
            {usernameMessage ? (
              <span className="mt-2 block text-xs text-[#52605a] dark:text-muted-foreground">
                {usernameMessage}
              </span>
            ) : null}
          </label>
        ) : null}

        {mode !== "reset" ? (
          <label className="block">
            <span className="text-sm font-medium text-[#26332d] dark:text-foreground">
              Email
            </span>
            <input
              name="email"
              type="email"
              className="mt-2 h-11 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30"
              placeholder="exemplo@email.com"
              autoComplete="email"
              required
            />
          </label>
        ) : null}

        {mode !== "reset" ? (
          <label className="block">
            <span className="text-sm font-medium text-[#26332d] dark:text-foreground">
              Password
            </span>
            <span className="mt-2 flex h-11 items-center rounded-md border border-[#d7ded3] bg-white pr-2 ring-[#16735f]/20 transition focus-within:border-[#16735f] focus-within:ring-4 dark:border-border dark:bg-input/30">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 outline-none"
                placeholder="Mínimo 8 caracteres"
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="flex h-8 w-8 items-center justify-center rounded text-[#52605a] hover:bg-[#eef2eb] dark:text-muted-foreground dark:hover:bg-accent"
                aria-label={showPassword ? "Esconder password" : "Mostrar password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
        ) : null}
      </div>

      {message ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-md border border-[#b7ddcb] bg-[#f0fbf5] px-3 py-2 text-sm text-[#126047]"
        >
          {message}
        </p>
      ) : null}

      {error ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-md border border-[#f0c6bd] bg-[#fff4f1] px-3 py-2 text-sm text-[#9a2f25]"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#16735f] px-4 text-sm font-semibold text-white transition hover:bg-[#0f5d4d] disabled:opacity-60"
      >
        {pending ? <Loader2 className="animate-spin" size={17} /> : null}
        {mode === "reset"
          ? resetStep === "request"
            ? "Enviar código"
            : "Guardar nova password"
          : mode === "signIn"
            ? "Entrar na liga"
            : "Criar conta"}
      </button>

      {mode === "signIn" ? (
        <button
          type="button"
          onClick={() => chooseMode("reset")}
          className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#16735f] transition hover:text-[#0f5d4d] dark:text-primary"
        >
          <MailCheck size={16} />
          Esqueceste-te da password?
        </button>
      ) : null}
    </form>
  );
}
