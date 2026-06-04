"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";

type Mode = "signIn" | "signUp";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>("signIn");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const usernameAvailable = useQuery(
    api.betting.usernameAvailable,
    mode === "signUp" && username.trim().length >= 3
      ? { username: username.trim() }
      : "skip",
  );

  const usernameMessage = useMemo(() => {
    if (mode !== "signUp" || username.trim().length === 0) return "";
    if (username.trim().length < 3) return "Usa pelo menos 3 caracteres.";
    if (usernameAvailable === undefined) return "A verificar username...";
    return usernameAvailable ? "Username disponivel." : "Username ja existe.";
  }, [mode, username, usernameAvailable]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("flow", mode);

      if (mode === "signUp" && usernameAvailable === false) {
        throw new Error("Escolhe outro username.");
      }

      await signIn("password", formData);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Nao foi possivel autenticar. Tenta novamente.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[#d7ded3] bg-white p-6 shadow-sm"
    >
      <div className="mb-6 flex rounded-md border border-[#dfe5dc] bg-[#f6f7f2] p-1">
        <button
          type="button"
          onClick={() => setMode("signIn")}
          className={`flex h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
            mode === "signIn"
              ? "bg-[#16735f] text-white"
              : "text-[#52605a] hover:text-[#18201b]"
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
              ? "bg-[#16735f] text-white"
              : "text-[#52605a] hover:text-[#18201b]"
          }`}
        >
          <UserPlus size={16} />
          Registar
        </button>
      </div>

      <div className="space-y-4">
        {mode === "signUp" ? (
          <label className="block">
            <span className="text-sm font-medium text-[#26332d]">Username</span>
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4"
              placeholder="ricardo2026"
              autoComplete="username"
              required
            />
            {usernameMessage ? (
              <span
                className={`mt-2 block text-xs ${
                  usernameAvailable === false ? "text-[#b43b2f]" : "text-[#52605a]"
                }`}
              >
                {usernameMessage}
              </span>
            ) : null}
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-[#26332d]">Email</span>
          <input
            name="email"
            type="email"
            className="mt-2 h-11 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4"
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-[#26332d]">Password</span>
          <span className="mt-2 flex h-11 items-center rounded-md border border-[#d7ded3] bg-white pr-2 ring-[#16735f]/20 transition focus-within:border-[#16735f] focus-within:ring-4">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 outline-none"
              placeholder="minimo 8 caracteres"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="flex h-8 w-8 items-center justify-center rounded text-[#52605a] hover:bg-[#eef2eb]"
              aria-label={showPassword ? "Esconder password" : "Mostrar password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-[#f0c6bd] bg-[#fff4f1] px-3 py-2 text-sm text-[#9a2f25]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || (mode === "signUp" && usernameAvailable === false)}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#16735f] px-4 text-sm font-semibold text-white transition hover:bg-[#0f5d4d] disabled:opacity-60"
      >
        {pending ? <Loader2 className="animate-spin" size={17} /> : null}
        {mode === "signIn" ? "Entrar na liga" : "Criar conta"}
      </button>
    </form>
  );
}
