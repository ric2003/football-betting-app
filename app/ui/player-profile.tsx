"use client";

import { useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Crown,
  EyeOff,
  Loader2,
  Medal,
  MinusCircle,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { DisplayMatchStatus } from "./match-status";

type ProfileData = NonNullable<ReturnType<typeof useQuery<typeof api.betting.playerProfile>>>;
type ProfileMatch = ProfileData["matches"][number];
type SpecialBreakdown = ProfileData["specialBreakdown"][number];

const stageLabels = {
  group: "Fase de Grupos",
  roundOf32: "16 Avos de Final",
  roundOf16: "Oitavos de Final",
  quarterFinal: "Quartos de Final",
  semiFinal: "Meias-Finais",
  thirdPlace: "3º Lugar",
  final: "Final",
} as const;

function formatKickoff(value: number) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(value);
}

function signedPoints(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function PlayerProfile({ userId }: { userId: string }) {
  const profile = useQuery(api.betting.playerProfile, { userId });

  if (profile === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] dark:bg-background">
        <Loader2 className="animate-spin text-[#16735f]" size={28} />
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="min-h-screen bg-[#f6f7f2] px-4 py-8 text-[#18201b] dark:bg-background dark:text-foreground">
        <div className="mx-auto max-w-3xl rounded-lg border border-[#d7ded3] bg-white p-6 shadow-sm dark:border-border dark:bg-card">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#16735f] dark:text-primary"
          >
            <ArrowLeft size={16} />
            Voltar ao Leaderboard
          </Link>
          <h1 className="mt-5 text-2xl font-black">Perfil nao encontrado</h1>
          <p className="mt-2 text-sm text-[#52605a] dark:text-muted-foreground">
            Este jogador não existe ou já não esta disponivel.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f2] pb-10 text-[#18201b] dark:bg-background dark:text-foreground">
      <header className="border-b border-[#dfe5dc] bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="h-1 bg-[#16735f]" />
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#16735f] dark:text-primary"
          >
            <ArrowLeft size={16} />
            Voltar ao leaderboard
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#16735f] dark:text-primary">
                Perfil do Jogador
              </p>
              <h1 className="mt-1 text-3xl font-black">{profile.user.username}</h1>
              <p className="mt-2 max-w-2xl text-sm text-[#52605a] dark:text-muted-foreground">
                Só aparecem Apostas de jogos que já começaram. Jogos futuros ficam escondidos para ninguém copiar as Apostas.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-[#16735f] px-4 py-3 font-black text-white">
              <Medal size={20} />
              {profile.totals.totalPoints} pts
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-4">
          <StatTile icon={<Trophy size={18} />} label="Total" value={`${profile.totals.totalPoints} pts`} />
          <StatTile icon={<CalendarDays size={18} />} label="Jogos" value={`${profile.totals.matchPoints} pts`} />
          <StatTile icon={<Crown size={18} />} label="Especiais" value={`${profile.totals.specialPoints} pts`} />
          <StatTile icon={<CheckCircle2 size={18} />} label="Exatos" value={String(profile.totals.exactMatches)} />
        </section>

        {profile.hiddenMatchCount > 0 ? (
          <p className="mt-4 flex items-center gap-2 rounded-md border border-[#f1ddb2] bg-[#fffaf0] px-3 py-2 text-sm font-semibold text-[#8a5d12] dark:border-[#9a6a18]/50 dark:bg-[#2a2114] dark:text-[#f5c542]">
            <EyeOff size={16} />
            {profile.hiddenMatchCount} Jogo{profile.hiddenMatchCount > 1 ? "s" : ""} ainda escondido{profile.hiddenMatchCount > 1 ? "s" : ""}.
          </p>
        ) : null}

        <section className="mt-6 rounded-lg border border-[#d7ded3] bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Resultados dos Jogos</h2>
              <p className="text-sm text-[#52605a] dark:text-muted-foreground">
                Certo vale 3 pts, Exato vale 5 pts.
              </p>
            </div>
            <span className="rounded-md bg-[#eef2eb] px-3 py-2 text-sm font-bold text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
              {profile.matches.length} Visíveis
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {profile.matches.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#cbd5c7] bg-[#fbfcfa] p-4 text-sm text-[#52605a] dark:border-border dark:bg-secondary dark:text-muted-foreground">
                Ainda não há jogos ao vivo ou terminados para mostrar.
              </p>
            ) : (
              profile.matches.map((match) => <ProfileMatchRow key={match._id} match={match} />)
            )}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-[#d7ded3] bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Apostas Especiais</h2>
              <p className="text-sm text-[#52605a] dark:text-muted-foreground">
                Só são reveladas quando houver resultado oficial.
              </p>
            </div>
            <span className="rounded-md bg-[#fff3d7] px-3 py-2 text-sm font-bold text-[#7b5613] dark:bg-[#33270d] dark:text-[#f5c542]">
              {profile.totals.specialPoints} pts
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {profile.specialBreakdown.length > 0 ? (
              profile.specialBreakdown.map((item) => (
                <SpecialRow key={item.key} item={item} />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[#cbd5c7] bg-[#fbfcfa] p-4 text-sm text-[#52605a] dark:border-border dark:bg-secondary dark:text-muted-foreground md:col-span-2">
                {profile.specialsAreResolved
                  ? "Sem apostas especiais registadas."
                  : "As Apostas Especiais ainda estão escondidas."}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#d7ded3] bg-white p-4 shadow-sm dark:border-border dark:bg-card">
      <div className="flex items-center justify-between gap-3 text-[#16735f] dark:text-primary">
        {icon}
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#52605a] dark:text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function ProfileMatchRow({ match }: { match: ProfileMatch }) {
  const displayStatus = match.displayStatus as DisplayMatchStatus;
  const isFinished = displayStatus === "finished";
  const tone = !match.bet
    ? "missed"
    : match.bet.points >= 5
      ? "exact"
      : match.bet.points > 0
        ? "correct"
        : isFinished
          ? "wrong"
          : "live";
  const stage = match.stage === "group" ? `Grupo ${match.group ?? "?"}` : stageLabels[match.stage];

  return (
    <article className="grid gap-3 rounded-lg border border-[#edf1ea] bg-[#fbfcfa] p-3 dark:border-border dark:bg-background lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#52605a] dark:text-muted-foreground">
          <span>{stage}</span>
          <span>·</span>
          <span>{formatKickoff(match.kickoffAt)}</span>
          <StatusPill status={displayStatus} />
        </div>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <TeamName name={match.homeTeam} code={match.homeTeamCode} />
          <div className="grid justify-items-center gap-1">
            {isFinished ? (
              <ScorePair home={match.homeScore} away={match.awayScore} strong />
            ) : (
              <span className="rounded-md bg-[#eef2eb] px-2 py-1 text-xs font-bold text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
                Em jogo
              </span>
            )}
            <PredictionScore bet={match.bet} />
          </div>
          <TeamName name={match.awayTeam} code={match.awayTeamCode} align="right" />
        </div>
      </div>
      <OutcomePill tone={tone} points={match.bet?.points ?? 0} />
    </article>
  );
}

function TeamName({
  name,
  code,
  align = "left",
}: {
  name: string;
  code?: string;
  align?: "left" | "right";
}) {
  return (
    <span className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <span className="block truncate text-sm font-black sm:text-base">{name}</span>
      <span className="mt-1 inline-flex rounded bg-[#eef2eb] px-2 py-1 text-xs font-bold text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
        {code ?? "TBD"}
      </span>
    </span>
  );
}

function ScorePair({
  home,
  away,
  strong = false,
}: {
  home?: number;
  away?: number;
  strong?: boolean;
}) {
  return (
    <span className={`flex items-center gap-1 rounded-md px-2 py-1 font-black ${strong ? "bg-[#16735f] text-white" : "bg-[#eef2eb] text-[#18201b] dark:bg-secondary dark:text-foreground"}`}>
      <span>{home ?? "-"}</span>
      <span>-</span>
      <span>{away ?? "-"}</span>
    </span>
  );
}

function PredictionScore({ bet }: { bet: ProfileMatch["bet"] }) {
  return bet ? (
    <span className="text-xs font-semibold text-[#52605a] dark:text-muted-foreground">
      Palpite: {bet.homeScore}-{bet.awayScore}
    </span>
  ) : (
    <span className="text-xs font-semibold text-[#8a958f] dark:text-muted-foreground">
      Sem palpite
    </span>
  );
}

function OutcomePill({
  tone,
  points,
}: {
  tone: "exact" | "correct" | "wrong" | "missed" | "live";
  points: number;
}) {
  const config = {
    exact: {
      icon: CheckCircle2,
      text: `Exato ${signedPoints(points)} pts`,
      className: "bg-[#eaf4ef] text-[#16735f] dark:bg-[#103d32] dark:text-[#7ee0c3]",
    },
    correct: {
      icon: ShieldCheck,
      text: `Certo ${signedPoints(points)} pts`,
      className: "bg-[#eaf4ef] text-[#16735f] dark:bg-[#103d32] dark:text-[#7ee0c3]",
    },
    wrong: {
      icon: XCircle,
      text: "Errado 0 pts",
      className: "bg-[#fff1f1] text-[#9f2f2f] dark:bg-[#3b1515] dark:text-[#f2a8a8]",
    },
    missed: {
      icon: MinusCircle,
      text: "Sem palpite",
      className: "bg-[#eef2eb] text-[#52605a] dark:bg-secondary dark:text-muted-foreground",
    },
    live: {
      icon: CalendarDays,
      text: "A decorrer",
      className: "bg-[#fff3d7] text-[#7b5613] dark:bg-[#33270d] dark:text-[#f5c542]",
    },
  }[tone];
  const Icon = config.icon;

  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-black ${config.className}`}>
      <Icon size={16} />
      {config.text}
    </span>
  );
}

function StatusPill({ status }: { status: DisplayMatchStatus }) {
  const label = status === "finished" ? "Terminado" : status === "live" ? "Ao vivo" : "Agendado";
  return (
    <span className="rounded bg-[#eef2eb] px-2 py-1 text-[10px] text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
      {label}
    </span>
  );
}

function SpecialRow({ item }: { item: SpecialBreakdown }) {
  return (
    <article className="rounded-lg border border-[#edf1ea] bg-[#fbfcfa] p-3 dark:border-border dark:bg-background">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black">{item.label}</h3>
          <p className="mt-1 text-sm text-[#52605a] dark:text-muted-foreground">
            Palpite: {item.bet}
          </p>
          {!item.correct ? (
            <p className="mt-1 text-sm text-[#52605a] dark:text-muted-foreground">
              Certo: {item.result}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-sm font-black ${
            item.correct
              ? "bg-[#eaf4ef] text-[#16735f] dark:bg-[#103d32] dark:text-[#7ee0c3]"
              : "bg-[#eef2eb] text-[#52605a] dark:bg-secondary dark:text-muted-foreground"
          }`}
        >
          {signedPoints(item.points)}/{item.maxPoints}
        </span>
      </div>
    </article>
  );
}
