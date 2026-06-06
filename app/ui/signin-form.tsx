"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";

type Mode = "signIn" | "signUp";

const INVALID_CREDENTIAL_ERROR =
  "Email ou password incorretos. Confirma os dados e tenta novamente.";
const GENERIC_AUTH_ERROR = "Nao foi possivel autenticar. Tenta novamente.";

function authErrorMessage(caught: unknown) {
  if (!(caught instanceof Error)) {
    return GENERIC_AUTH_ERROR;
  }

  const message = caught.message;

  if (
    message.includes("InvalidAccountId") ||
    message.includes("InvalidSecret") ||
    message.includes("Invalid credentials")
  ) {
    return INVALID_CREDENTIAL_ERROR;
  }

  if (message.includes("TooManyFailedAttempts")) {
    return "Demasiadas tentativas falhadas. Espera um pouco e tenta novamente.";
  }

  return message || GENERIC_AUTH_ERROR;
}

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>("signIn");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const usernameMessage =
    mode === "signUp" && username.trim().length > 0 && username.trim().length < 3
      ? "Usa pelo menos 3 caracteres."
      : "";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", mode);

      if (mode === "signUp") {
        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 3) {
          throw new Error("O username deve ter pelo menos 3 caracteres.");
        }
        formData.set("username", trimmedUsername);
      }

      await signIn("password", formData);
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[#f4eadc]/25 bg-[#090b09]/70 p-6 text-[#f8efdf] shadow-2xl shadow-black/30 backdrop-blur-md"
    >
      <div className="mb-6 flex rounded-md border border-[#f4eadc]/20 bg-white/10 p-1">
        <button
          type="button"
          onClick={() => setMode("signIn")}
          className={`flex h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
            mode === "signIn"
              ? "bg-[#f4eadc] text-[#10130f]"
              : "text-[#f4eadc]/70 hover:text-[#fffaf0]"
          }`}
        >
          <LogIn size={16} />
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("signUp")}
          className={`flex h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
            mode === "signUp"
              ? "bg-[#f4eadc] text-[#10130f]"
              : "text-[#f4eadc]/70 hover:text-[#fffaf0]"
          }`}
        >
          <UserPlus size={16} />
          Registar
        </button>
      </div>

      <div className="space-y-4">
        {mode === "signUp" ? (
          <label className="block">
            <span className="text-sm font-medium text-[#f8efdf]">Username</span>
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-[#f4eadc]/20 bg-white/10 px-3 text-[#fffaf0] outline-none ring-[#f4eadc]/15 transition placeholder:text-[#f4eadc]/45 focus:border-[#f4eadc]/60 focus:ring-4"
              placeholder="ricardo2026"
              autoComplete="username"
              required
            />
            {usernameMessage ? (
              <span className="mt-2 block text-xs text-[#f4eadc]/65">
                {usernameMessage}
              </span>
            ) : null}
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-[#f8efdf]">Email</span>
          <input
            name="email"
            type="email"
            className="mt-2 h-11 w-full rounded-md border border-[#f4eadc]/20 bg-white/10 px-3 text-[#fffaf0] outline-none ring-[#f4eadc]/15 transition placeholder:text-[#f4eadc]/45 focus:border-[#f4eadc]/60 focus:ring-4"
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[#f8efdf]">Password</span>
          <span className="mt-2 flex h-11 items-center rounded-md border border-[#f4eadc]/20 bg-white/10 pr-2 ring-[#f4eadc]/15 transition focus-within:border-[#f4eadc]/60 focus-within:ring-4">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-[#fffaf0] outline-none placeholder:text-[#f4eadc]/45"
              placeholder="minimo 8 caracteres"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="flex h-8 w-8 items-center justify-center rounded text-[#f4eadc]/70 hover:bg-white/10 hover:text-[#fffaf0]"
              aria-label={showPassword ? "Esconder password" : "Mostrar password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
      </div>

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
        {mode === "signIn" ? "Entrar na liga" : "Criar conta"}
      </button>
    </form>
  );
}
