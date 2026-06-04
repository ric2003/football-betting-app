"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  ChevronDown,
  Crown,
  ListChecks,
  Loader2,
  Lock,
  LogOut,
  Medal,
  Save,
  Shield,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { displayStatusForPortugalTime, type DisplayMatchStatus } from "./match-status";

const teamSpecialFields = [
  ["worldCupWinnerTeamId", "Vencedor do Mundial"],
  ["mostGoalsTeamId", "Equipa com mais golos"],
  ["fewestConcededTeamId", "Equipa com menos golos sofridos"],
] as const;

const playerSpecialFields = [
  ["mvpPlayerId", "MVP"],
  ["youngMvpPlayerId", "MVP jovem"],
  ["topScorerPlayerId", "Melhor marcador"],
  ["topAssisterPlayerId", "Melhor assistente"],
] as const;

const numberSpecialFields = [
  ["ownGoals", "Numero de auto-golos"],
  ["redCards", "Numero de cartoes vermelhos"],
] as const;

const stageLabels = {
  group: "Fase de grupos",
  roundOf32: "16 avos de final",
  roundOf16: "Oitavos de final",
  quarterFinal: "Quartos de final",
  semiFinal: "Meias-finais",
  thirdPlace: "3o lugar",
  final: "Final",
} as const;

const statusLabels = {
  scheduled: "Agendado",
  live: "Ao vivo",
  finished: "Terminado",
} as const;

const knockoutStageOrder: Array<keyof typeof stageLabels> = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "thirdPlace",
  "final",
];

type DashboardView = "games" | "leaderboard" | "specials";

type MatchRow = {
  _id: Id<"matches">;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: number;
  stage: keyof typeof stageLabels;
  group?: string;
  status: "scheduled" | "finished";
  displayStatus: DisplayMatchStatus;
  homeScore?: number;
  awayScore?: number;
  bet: { homeScore: number; awayScore: number; points: number } | null;
};

type MatchSection = {
  key: string;
  title: string;
  order: number;
  matches: MatchRow[];
};

function formatKickoff(value: number) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(value);
}

function toNumber(value: FormDataEntryValue | null) {
  return Number.parseInt(String(value ?? ""), 10);
}

function groupMatchSections(matches: MatchRow[]) {
  const sections = new Map<string, MatchSection>();

  for (const match of matches) {
    const isGroup = match.stage === "group";
    const group = match.group ?? "?";
    const key = isGroup ? `group-${group}` : match.stage;
    const title = isGroup ? `Grupo ${group}` : stageLabels[match.stage];
    const order = isGroup
      ? group.charCodeAt(0) - "A".charCodeAt(0)
      : 100 + knockoutStageOrder.indexOf(match.stage);

    if (!sections.has(key)) sections.set(key, { key, title, order, matches: [] });
    sections.get(key)?.matches.push(match);
  }

  return Array.from(sections.values())
    .map((section) => ({
      ...section,
      matches: section.matches.toSorted(
        (a, b) =>
          a.kickoffAt - b.kickoffAt ||
          a.homeTeam.localeCompare(b.homeTeam) ||
          a.awayTeam.localeCompare(b.awayTeam),
      ),
    }))
    .toSorted((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function Dashboard() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.betting.currentUser);
  const data = useQuery(api.betting.dashboard);
  const leaderboard = useQuery(api.betting.leaderboard);
  const catalog = useQuery(api.betting.catalogOptions);
  const saveSpecialBet = useMutation(api.betting.saveSpecialBet);
  const [activeView, setActiveView] = useState<DashboardView>("games");
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const [specialMessage, setSpecialMessage] = useState("");
  const [savingSpecial, setSavingSpecial] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function onSpecialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSpecial(true);
    setSpecialMessage("");

    const formData = new FormData(event.currentTarget);
    try {
      await saveSpecialBet({
        worldCupWinnerTeamId: String(formData.get("worldCupWinnerTeamId")) as Id<"teams">,
        mvpPlayerId: String(formData.get("mvpPlayerId")) as Id<"players">,
        youngMvpPlayerId: String(formData.get("youngMvpPlayerId")) as Id<"players">,
        topScorerPlayerId: String(formData.get("topScorerPlayerId")) as Id<"players">,
        topAssisterPlayerId: String(formData.get("topAssisterPlayerId")) as Id<"players">,
        mostGoalsTeamId: String(formData.get("mostGoalsTeamId")) as Id<"teams">,
        fewestConcededTeamId: String(formData.get("fewestConcededTeamId")) as Id<"teams">,
        ownGoals: toNumber(formData.get("ownGoals")),
        redCards: toNumber(formData.get("redCards")),
      });
      setSpecialMessage("Previsoes especiais guardadas.");
    } catch (caught) {
      setSpecialMessage(
        caught instanceof Error ? caught.message : "Nao foi possivel guardar.",
      );
    } finally {
      setSavingSpecial(false);
    }
  }

  if (
    user === undefined ||
    data === undefined ||
    leaderboard === undefined ||
    catalog === undefined
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2]">
        <Loader2 className="animate-spin text-[#16735f]" size={28} />
      </main>
    );
  }

  const matches = (data.matches as MatchRow[]).map((match) => ({
    ...match,
    displayStatus: displayStatusForPortugalTime(match, now),
  }));
  const sections = groupMatchSections(matches);
  const firstKickoffAt =
    matches.length > 0
      ? matches.reduce(
          (earliest, match) => Math.min(earliest, match.kickoffAt),
          Number.POSITIVE_INFINITY,
        )
      : null;
  const specialBetsAreOpen = firstKickoffAt === null || firstKickoffAt > now;
  const youngPlayerOptions =
    "youngPlayers" in catalog && Array.isArray(catalog.youngPlayers)
      ? catalog.youngPlayers
      : catalog.players.filter((player) => player.isYoung);
  const canUseSpecials =
    catalog.teams.length > 0 &&
    catalog.players.length > 0 &&
    youngPlayerOptions.length > 0 &&
    specialBetsAreOpen;
  const openSectionCount = openSections.size;

  function toggleSection(sectionKey: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[#f6f7f2] text-[#18201b]">
      <header className="border-b border-[#dfe5dc] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#16735f]">
              Mundial Bet 2026
            </p>
            <h1 className="text-2xl font-semibold">Painel da liga</h1>
          </div>
          <div className="flex items-center gap-2">
            {user?.isAdmin ? (
              <Link
                href="/admin"
                className="flex h-10 items-center gap-2 rounded-md border border-[#d7ded3] bg-white px-3 text-sm font-semibold hover:bg-[#eef2eb]"
              >
                <Shield size={16} />
                Admin
              </Link>
            ) : null}
            <button
              onClick={() => void signOut()}
              className="flex h-10 items-center gap-2 rounded-md bg-[#18201b] px-3 text-sm font-semibold text-white hover:bg-[#2b3730]"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <nav className="grid gap-2 rounded-lg border border-[#d7ded3] bg-white p-2 sm:grid-cols-3">
          <ViewButton
            active={activeView === "games"}
            icon={<ListChecks size={17} />}
            label="Jogos"
            meta={`${matches.length} jogos`}
            onClick={() => setActiveView("games")}
          />
          <ViewButton
            active={activeView === "leaderboard"}
            icon={<Crown size={17} />}
            label="Leaderboard"
            meta={`${leaderboard.length} jogadores`}
            onClick={() => setActiveView("leaderboard")}
          />
          <ViewButton
            active={activeView === "specials"}
            icon={<Trophy size={17} />}
            label="Especiais"
            meta={`${data.specialPoints} pts`}
            onClick={() => setActiveView("specials")}
          />
        </nav>

        <div className="mt-6">
          {activeView === "games" ? (
            <section className="rounded-lg border border-[#d7ded3] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Jogos</h2>
                  <p className="text-sm text-[#52605a]">
                    Apostas abertas apenas enquanto o jogo esta agendado.
                  </p>
                </div>
                <div className="rounded-md bg-[#eaf4ef] px-3 py-2 text-sm font-semibold text-[#16735f]">
                  Exato 5 pts · Vencedor 3 pts
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {sections.length === 0 ? (
                  <p className="rounded-md border border-dashed border-[#cbd5c7] p-4 text-sm text-[#52605a]">
                    Ainda nao ha jogos. Um admin pode criar equipas, jogadores e jogos.
                  </p>
                ) : (
                  sections.map((section) => (
                    <MatchSectionPanel
                      key={section.key}
                      section={section}
                      isOpen={openSections.has(section.key)}
                      onToggle={() => toggleSection(section.key)}
                    />
                  ))
                )}
              </div>
              {sections.length > 0 ? (
                <p className="mt-4 text-xs font-medium text-[#52605a]">
                  {openSectionCount === 0
                    ? "Escolhe um grupo ou fase para abrir."
                    : `${openSectionCount} seccao aberta${openSectionCount > 1 ? "s" : ""}.`}
                </p>
              ) : null}
            </section>
          ) : null}

          {activeView === "leaderboard" ? (
            <section className="rounded-lg border border-[#d7ded3] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Crown className="text-[#b88716]" size={20} />
                  <h2 className="text-xl font-semibold">Leaderboard</h2>
                </div>
                <div className="rounded-md bg-[#eef2eb] px-3 py-2 text-sm font-semibold text-[#52605a]">
                  {leaderboard.length} jogadores
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {leaderboard.map((row, index) => (
                  <LeaderboardRow key={row.userId} row={row} rank={index + 1} />
                ))}
              </div>
            </section>
          ) : null}

          {activeView === "specials" ? (
          <form
            onSubmit={onSpecialSubmit}
            className="rounded-lg border border-[#d7ded3] bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Apostas especiais</h2>
                <p className="text-sm text-[#52605a]">
                  Disponiveis ate ao inicio do primeiro jogo.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-[#fff3d7] px-3 py-2 text-sm font-semibold text-[#7b5613]">
                <Trophy size={16} />
                {data.specialPoints} pts
              </div>
            </div>
            {firstKickoffAt !== null ? (
              <p
                className={`mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                  specialBetsAreOpen
                    ? "bg-[#eaf4ef] text-[#16735f]"
                    : "bg-[#eef2eb] text-[#52605a]"
                }`}
              >
                {!specialBetsAreOpen ? <Lock size={15} /> : <CalendarDays size={15} />}
                {specialBetsAreOpen
                  ? `Fecham em ${formatKickoff(firstKickoffAt)}.`
                  : `Fecharam em ${formatKickoff(firstKickoffAt)}.`}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {teamSpecialFields.map(([name, label]) => (
                <OptionSelect
                  key={name}
                  name={name}
                  label={label}
                  options={catalog.teams}
                  defaultValue={data.specialBet?.[name] ?? ""}
                  disabled={!specialBetsAreOpen}
                />
              ))}
              {playerSpecialFields.map(([name, label]) => (
                <OptionSelect
                  key={name}
                  name={name}
                  label={label}
                  options={name === "youngMvpPlayerId" ? youngPlayerOptions : catalog.players}
                  defaultValue={data.specialBet?.[name] ?? ""}
                  disabled={!specialBetsAreOpen}
                />
              ))}
              {numberSpecialFields.map(([name, label]) => (
                <label key={name} className="block">
                  <span className="text-sm font-medium">{label}</span>
                  <input
                    name={name}
                    type="number"
                    min={0}
                    defaultValue={data.specialBet?.[name] ?? 0}
                    disabled={!specialBetsAreOpen}
                    className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] px-3 outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4"
                    required
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingSpecial || !canUseSpecials}
                className="flex h-10 items-center gap-2 rounded-md bg-[#16735f] px-4 text-sm font-semibold text-white hover:bg-[#0f5d4d] disabled:opacity-60"
              >
                {savingSpecial ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar especiais
              </button>
              {specialMessage ? (
                <span className="text-sm text-[#52605a]">{specialMessage}</span>
              ) : null}
              {!canUseSpecials ? (
                <span className="text-sm text-[#9a6a18]">
                  {!specialBetsAreOpen
                    ? "As apostas especiais ja estao fechadas."
                    : "E preciso configurar equipas, jogadores e jogadores jovens primeiro."}
                </span>
              ) : null}
            </div>
          </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ViewButton({
  active,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 items-center gap-3 rounded-md px-4 py-3 text-left transition ${
        active
          ? "bg-[#16735f] text-white shadow-sm"
          : "text-[#52605a] hover:bg-[#eef2eb] hover:text-[#18201b]"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          active ? "bg-white/15" : "bg-[#eef2eb]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className={`block text-xs ${active ? "text-white/80" : "text-[#718078]"}`}>
          {meta}
        </span>
      </span>
    </button>
  );
}

function MatchSectionPanel({
  section,
  isOpen,
  onToggle,
}: {
  section: MatchSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const openMatches = section.matches.filter((match) => match.displayStatus === "scheduled").length;
  const liveMatches = section.matches.filter((match) => match.displayStatus === "live").length;

  return (
    <section className="rounded-md border border-[#edf1ea]">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-[#f8faf6] sm:grid-cols-[1fr_auto]"
        aria-expanded={isOpen}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eef2eb] text-[#16735f]">
            <ChevronDown
              size={17}
              className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{section.title}</span>
            <span className="block text-xs text-[#52605a]">
              {section.matches.length} jogos · primeiro: {formatKickoff(section.matches[0].kickoffAt)}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#52605a] sm:justify-end">
          {openMatches > 0 ? (
            <span className="rounded bg-[#eaf4ef] px-2 py-1 text-[#16735f]">
              {openMatches} aberto{openMatches > 1 ? "s" : ""}
            </span>
          ) : null}
          {liveMatches > 0 ? (
            <span className="rounded bg-[#fff3d7] px-2 py-1 text-[#9a6a18]">
              {liveMatches} ao vivo
            </span>
          ) : null}
        </span>
      </button>
      {isOpen ? (
        <div className="grid gap-3 border-t border-[#edf1ea] bg-white p-3">
          {section.matches.map((match) => (
            <MatchBetForm key={match._id} match={match} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LeaderboardRow({
  row,
  rank,
}: {
  row: {
    username: string;
    matchPoints: number;
    specialPoints: number;
    exactMatches: number;
    totalPoints: number;
  };
  rank: number;
}) {
  const podium =
    rank === 1
      ? {
          row: "border-[#e0b72c] bg-[#fff5cf]",
          badge: "bg-[#f4c430] text-[#3e2f06]",
          icon: "text-[#8a6500]",
          label: "Campeao",
        }
      : rank === 2
        ? {
            row: "border-[#c9ced3] bg-[#f2f4f5]",
            badge: "bg-[#c7cdd2] text-[#283039]",
            icon: "text-[#68727c]",
            label: "Segundo",
          }
        : rank === 3
          ? {
              row: "border-[#c98f5a] bg-[#fff0e2]",
              badge: "bg-[#c68147] text-white",
              icon: "text-[#8a4f23]",
              label: "Terceiro",
            }
          : {
              row: "border-[#edf1ea] bg-white",
              badge: "bg-[#eef2eb] text-[#52605a]",
              icon: "text-[#52605a]",
              label: null,
            };

  return (
    <div
      className={`grid gap-3 rounded-md border px-3 py-3 sm:grid-cols-[56px_1fr_auto] sm:items-center ${podium.row}`}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-md text-base font-bold ${podium.badge}`}
      >
        {rank}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-lg font-semibold">{row.username}</p>
          {podium.label ? (
            <span className="rounded px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#52605a]">
              {podium.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[#52605a]">
          Jogos {row.matchPoints} · Especiais {row.specialPoints} · Exatos {row.exactMatches}
        </p>
      </div>
      <div className="flex items-center gap-2 justify-self-start rounded-md bg-white/70 px-3 py-2 font-semibold sm:justify-self-end">
        <Medal className={podium.icon} size={18} />
        {row.totalPoints} pts
      </div>
    </div>
  );
}

function OptionSelect({
  name,
  label,
  options,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  options: { id: string; label: string }[];
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4"
        required
      >
        <option value="" disabled>
          Escolher opcao
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MatchBetForm({ match }: { match: MatchRow }) {
  const saveMatchBet = useMutation(api.betting.saveMatchBet);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const isBettingOpen = match.displayStatus === "scheduled";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    try {
      await saveMatchBet({
        matchId: match._id,
        homeScore: toNumber(formData.get("homeScore")),
        awayScore: toNumber(formData.get("awayScore")),
      });
      setMessage("Aposta guardada.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Nao foi possivel guardar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-lg border border-[#edf1ea] p-4 md:grid-cols-[1fr_auto]"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#52605a]">
          <CalendarDays size={16} />
          {formatKickoff(match.kickoffAt)}
          <StatusBadge status={match.displayStatus} />
        </div>
        <h3 className="mt-2 text-lg font-semibold">
          {match.homeTeam} vs {match.awayTeam}
        </h3>
        {match.displayStatus === "finished" ? (
          <p className="mt-1 text-sm font-semibold text-[#16735f]">
            Final: {match.homeScore} - {match.awayScore} · Ganhaste{" "}
            {match.bet?.points ?? 0} pts
          </p>
        ) : message ? (
          <p className="mt-1 text-sm text-[#52605a]">{message}</p>
        ) : !isBettingOpen ? (
          <p className="mt-1 flex items-center gap-1 text-sm text-[#9a6a18]">
            <Lock size={14} />
            Apostas fechadas.
          </p>
        ) : null}
      </div>

      <div className="flex items-end gap-2">
        <label>
          <span className="sr-only">{match.homeTeam}</span>
          <input
            name="homeScore"
            type="number"
            min={0}
            defaultValue={match.bet?.homeScore ?? 0}
            disabled={!isBettingOpen}
            className="h-10 w-16 rounded-md border border-[#d7ded3] text-center outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4 disabled:bg-[#eef2eb]"
            required
          />
        </label>
        <span className="pb-2 font-semibold">-</span>
        <label>
          <span className="sr-only">{match.awayTeam}</span>
          <input
            name="awayScore"
            type="number"
            min={0}
            defaultValue={match.bet?.awayScore ?? 0}
            disabled={!isBettingOpen}
            className="h-10 w-16 rounded-md border border-[#d7ded3] text-center outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4 disabled:bg-[#eef2eb]"
            required
          />
        </label>
        <button
          type="submit"
          disabled={pending || !isBettingOpen}
          className="flex h-10 w-10 items-center justify-center rounded-md bg-[#16735f] text-white hover:bg-[#0f5d4d] disabled:bg-[#a8b5ae]"
          aria-label="Guardar aposta"
        >
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        </button>
      </div>
    </form>
  );
}

function StatusBadge({ status }: { status: keyof typeof statusLabels }) {
  const className =
    status === "scheduled"
      ? "bg-[#eaf4ef] text-[#16735f]"
      : status === "live"
        ? "bg-[#fff3d7] text-[#9a6a18]"
        : "bg-[#eef2eb] text-[#52605a]";

  return (
    <span className={`rounded px-2 py-1 text-xs font-semibold ${className}`}>
      {statusLabels[status]}
    </span>
  );
}
