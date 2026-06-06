"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  ChevronDown,
  Crown,
  Flag,
  ListChecks,
  Loader2,
  Lock,
  LogOut,
  Medal,
  Minus,
  Plus,
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
  homeTeamCode?: string;
  awayTeamCode?: string;
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

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const flagCodeByTeamCode: Record<string, string> = {
  ALB: "al",
  ALG: "dz",
  ARG: "ar",
  AUT: "at",
  AUS: "au",
  BEL: "be",
  BOL: "bo",
  BIH: "ba",
  BRA: "br",
  BUL: "bg",
  CMR: "cm",
  CAN: "ca",
  CHI: "cl",
  CHN: "cn",
  CIV: "ci",
  COL: "co",
  CRC: "cr",
  CRO: "hr",
  CZE: "cz",
  DEN: "dk",
  ECU: "ec",
  EGY: "eg",
  ENG: "gb-eng",
  ESP: "es",
  FRA: "fr",
  GER: "de",
  GHA: "gh",
  GRE: "gr",
  HUN: "hu",
  IRL: "ie",
  IRN: "ir",
  ITA: "it",
  JPN: "jp",
  KOR: "kr",
  MAR: "ma",
  MEX: "mx",
  NED: "nl",
  NGA: "ng",
  NIR: "gb-nir",
  NOR: "no",
  NZL: "nz",
  PAR: "py",
  PER: "pe",
  POL: "pl",
  POR: "pt",
  QAT: "qa",
  ROU: "ro",
  RSA: "za",
  SCO: "gb-sct",
  SEN: "sn",
  SRB: "rs",
  SVK: "sk",
  SVN: "si",
  SWE: "se",
  SUI: "ch",
  TUN: "tn",
  TUR: "tr",
  UKR: "ua",
  URU: "uy",
  USA: "us",
  WAL: "gb-wls",
};

function flagPath(code?: string) {
  if (!code) return null;
  const normalized = code.toUpperCase();
  const flagCode = flagCodeByTeamCode[normalized] ?? normalized.toLowerCase();
  return `/1x1/${flagCode}.svg`;
}

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

function sectionKeyForMatch(match: MatchRow) {
  return match.stage === "group" ? `group-${match.group ?? "?"}` : match.stage;
}

function nextRelevantSectionKey(matches: MatchRow[], now: number) {
  const liveMatch = matches
    .filter((match) => match.displayStatus === "live")
    .toSorted((a, b) => a.kickoffAt - b.kickoffAt)[0];
  if (liveMatch) return sectionKeyForMatch(liveMatch);

  const nextMatch = matches
    .filter((match) => match.displayStatus === "scheduled" && match.kickoffAt >= now)
    .toSorted((a, b) => a.kickoffAt - b.kickoffAt)[0];
  if (nextMatch) return sectionKeyForMatch(nextMatch);

  const lastMatch = matches.toSorted((a, b) => b.kickoffAt - a.kickoffAt)[0];
  return lastMatch ? sectionKeyForMatch(lastMatch) : null;
}

function sectionTypeLabel(section: MatchSection) {
  return section.key.startsWith("group-") ? "Grupo" : "Eliminatoria";
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
  const [openMobileMatches, setOpenMobileMatches] = useState<Set<string>>(() => new Set());
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

  const isLoading =
    user === undefined ||
    data === undefined ||
    leaderboard === undefined ||
    catalog === undefined;
  const matches = data
    ? (data.matches as MatchRow[]).map((match) => ({
        ...match,
        displayStatus: displayStatusForPortugalTime(match, now),
      }))
    : [];
  const sections = groupMatchSections(matches);
  const nextSectionKey = nextRelevantSectionKey(matches, now);

  useEffect(() => {
    if (!nextSectionKey) return;
    const timer = window.setTimeout(() => {
      setOpenSections((current) => {
        if (current.size > 0) return current;
        return new Set([nextSectionKey]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [nextSectionKey]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2]">
        <Loader2 className="animate-spin text-[#16735f]" size={28} />
      </main>
    );
  }

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
    <main className="min-h-screen bg-[#f4f7fb] pb-28 text-[#121826] [background-image:linear-gradient(90deg,rgba(31,92,255,.045)_1px,transparent_1px),linear-gradient(rgba(16,22,47,.035)_1px,transparent_1px)] [background-size:44px_44px] sm:pb-8">
      <header className="border-b border-[#16735f]/40 bg-[#16735F] text-white shadow-sm">
        <div className="h-1 bg-gradient-to-r from-[#e11d48] via-[#f5c542] via-[#00a86b] to-[#16735f]" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-white/10 text-[#f5c542]">
              <Trophy size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f5c542]">
              Mundial Bet 2026
            </p>
              <h1 className="text-2xl font-semibold">Painel da liga</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.isAdmin ? (
              <Link
                href="/admin"
                className="flex h-10 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                <Shield size={16} />
                Admin
              </Link>
            ) : null}
            <button
              onClick={() => void signOut()}
              className="flex h-10 items-center gap-2 rounded-md bg-[#f5c542] px-3 text-sm font-bold text-[#16735F] hover:bg-[#e8b92f]"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="hidden sm:block">
          <DashboardDock
            activeView={activeView}
            matchCount={matches.length}
            leaderboardCount={leaderboard.length}
            specialPoints={data.specialPoints}
            onViewChange={setActiveView}
          />
        </div>

        <div className="mt-6">
          {activeView === "games" ? (
            <section className="overflow-hidden rounded-lg border border-[#dbe4f0] bg-white shadow-sm">
              <div className="relative border-b border-[#dbe4f0] bg-[#16735f] px-5 py-6 text-white">
                <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:36px_36px]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
                <div className="absolute inset-x-0 bottom-0 h-1 bg-[#16735f]" />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f5c542]">
                      <Flag size={15} />
                      Matchday
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">Jogos do Mundial</h2>
                    <p className="mt-1 max-w-2xl text-sm text-white/75">
                      Ajusta o resultado nos cards e guarda quando tiveres a certeza.
                    </p>
                  </div>
                
                </div>
              </div>

              <div className="space-y-3 p-3 sm:p-5">
                {sections.length === 0 ? (
                  <p className="rounded-md border border-dashed border-[#dbe4f0] p-4 text-sm text-[#5c667a]">
                    Ainda nao ha jogos. Um admin pode criar equipas, jogadores e jogos.
                  </p>
                ) : (
                  sections.map((section) => (
                    <MatchSectionPanel
                      key={section.key}
                      section={section}
                      isOpen={openSections.has(section.key)}
                      onToggle={() => toggleSection(section.key)}
                      openMobileMatches={openMobileMatches}
                      onMatchToggle={(matchId) =>
                        setOpenMobileMatches((current) => {
                          const next = new Set(current);
                          if (next.has(matchId)) next.delete(matchId);
                          else next.add(matchId);
                          return next;
                        })
                      }
                    />
                  ))
                )}
                {sections.length > 0 ? (
                  <p className="mt-4 text-xs font-medium text-[#5c667a]">
                    {openSectionCount === 0
                      ? "Escolhe um grupo ou fase para abrir."
                      : `${openSectionCount} seccao aberta${openSectionCount > 1 ? "s" : ""}.`}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeView === "leaderboard" ? (
            <section className="rounded-lg border border-[#dbe4f0] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Crown className="text-[#f5c542]" size={20} />
                  <h2 className="text-xl font-semibold">Leaderboard</h2>
                </div>
                <div className="rounded-md bg-[#f4f7fb] px-3 py-2 text-sm font-semibold text-[#5c667a]">
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
                <p className="text-sm text-[#5c667a]">
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
                    ? "bg-[#eef4ff] text-[#16735f]"
                    : "bg-[#f4f7fb] text-[#5c667a]"
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
                    className="mt-2 h-10 w-full rounded-md border border-[#dbe4f0] px-3 outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4"
                    required
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingSpecial || !canUseSpecials}
                className="flex h-10 items-center gap-2 rounded-md bg-[#16735f] px-4 text-sm font-semibold text-white hover:bg-[#194bd1] disabled:opacity-60"
              >
                {savingSpecial ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Guardar especiais
              </button>
              {specialMessage ? (
                <span className="text-sm text-[#5c667a]">{specialMessage}</span>
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
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-[#dbe4f0] bg-[#f4f7fb]/85 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden">
        <DashboardDock
          activeView={activeView}
          matchCount={matches.length}
          leaderboardCount={leaderboard.length}
          specialPoints={data.specialPoints}
          onViewChange={setActiveView}
          compact
        />
      </div>
    </main>
  );
}

function DashboardDock({
  activeView,
  matchCount,
  leaderboardCount,
  specialPoints,
  onViewChange,
  compact = false,
}: {
  activeView: DashboardView;
  matchCount: number;
  leaderboardCount: number;
  specialPoints: number;
  onViewChange: (view: DashboardView) => void;
  compact?: boolean;
}) {
  const items = [
    {
      id: "games",
      label: "Jogos",
      eyebrow: "Matchday",
      meta: `${matchCount} jogos`,
      description: "Grupos, fases e palpites",
      icon: ListChecks,
      active: activeView === "games",
      accent: "#EE4B2B",
      onClick: () => onViewChange("games"),
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      eyebrow: "Classificacao",
      meta: `${leaderboardCount} jogadores`,
      description: "Pontos e ranking da liga",
      icon: Crown,
      active: activeView === "leaderboard",
      accent: "#f5c542",
      onClick: () => onViewChange("leaderboard"),
    },
    {
      id: "specials",
      label: "Especiais",
      eyebrow: "Bola de ouro",
      meta: `${specialPoints} pts`,
      description: "Campeao, MVP e extras",
      icon: Trophy,
      active: activeView === "specials",
      accent: "#00a86b",
      onClick: () => onViewChange("specials"),
    },
  ];

  return (
    <nav
      aria-label="Navegacao principal"
      className={
        compact
          ? "w-full max-w-sm rounded-2xl border border-[#dbe4f0] bg-white/90 p-1.5 shadow-xl shadow-[#16735F]/15 backdrop-blur"
          : "rounded-2xl border border-[#dbe4f0] bg-white/85 p-2 shadow-lg shadow-[#16735F]/10 backdrop-blur"
      }
    >
      <div className={compact ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-3 gap-2"}>
        {items.map((item) => (
          <DockNavButton
            key={item.id}
            active={item.active}
            compact={compact}
            description={item.description}
            eyebrow={item.eyebrow}
            icon={item.icon}
            label={item.label}
            meta={item.meta}
            accent={item.accent}
            onClick={item.onClick}
          />
        ))}
      </div>
    </nav>
  );
}

function DockNavButton({
  active,
  compact,
  accent,
  description,
  eyebrow,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  compact: boolean;
  accent: string;
  description: string;
  eyebrow: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${meta}`}
      onClick={onClick}
      style={{ "--dock-accent": accent } as React.CSSProperties}
      className={`relative overflow-hidden rounded-xl transition ${
        active
          ? "bg-[#16735F] text-white shadow-md"
          : "bg-[#f7f9fd] text-[#5c667a] hover:bg-white hover:text-[#121826]"
      } ${compact ? "flex min-h-16 flex-col items-center justify-center px-2 py-2 text-center" : "flex min-h-20 items-center gap-3 px-4 py-3 text-left"}`}
    >
      {!compact ? (
        <span
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: active ? accent : "#dbe4f0" }}
        />
      ) : null}
      <span
        className={`flex shrink-0 items-center justify-center rounded-md ${
          compact ? "h-8 w-8" : "h-10 w-10"
        } ${active ? "bg-white/10" : "bg-white"}`}
      >
        <Icon
          size={compact ? 19 : 21}
          style={{ color: accent }}
        />
      </span>
      <span className={compact ? "mt-1 block" : "min-w-0"}>
        {!compact ? (
          <span
            className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            {eyebrow}
          </span>
        ) : null}
        <span className={`${compact ? "text-xs" : "block text-lg"} font-black leading-tight`}>
          {label}
        </span>
        <span className={`${compact ? "text-[10px]" : "mt-0.5 block truncate text-xs"} ${active ? "text-white/70" : "text-[#5c667a]"}`}>
          {compact ? meta : description}
        </span>
      </span>
      {!compact ? (
        <span
          className={`absolute right-4 top-4 rounded-md px-2 py-1 text-xs font-bold ${
            active ? "bg-white/10 text-white/80" : "bg-white text-[#5c667a]"
          }`}
        >
          {meta}
        </span>
      ) : null}
    </button>
  );
}

function MatchSectionPanel({
  section,
  isOpen,
  onToggle,
  openMobileMatches,
  onMatchToggle,
}: {
  section: MatchSection;
  isOpen: boolean;
  onToggle: () => void;
  openMobileMatches: Set<string>;
  onMatchToggle: (matchId: string) => void;
}) {
  const openMatches = section.matches.filter((match) => match.displayStatus === "scheduled").length;
  const liveMatches = section.matches.filter((match) => match.displayStatus === "live").length;
  const betMatches = section.matches.filter((match) => match.bet !== null).length;
  const predictionProgress = Math.round((betMatches / section.matches.length) * 100);
  const firstKickoff = formatKickoff(section.matches[0].kickoffAt);
  const typeLabel = sectionTypeLabel(section);

  return (
    <section className="overflow-hidden rounded-lg border border-[#dbe4f0] bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="group relative grid w-full gap-4 overflow-hidden px-4 py-4 text-left transition hover:bg-[#fbfcf8] lg:grid-cols-[1fr_320px]"
        aria-expanded={isOpen}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-[#16735f]" />
        <span className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#dbe4f0] bg-[#eef4ff] text-[#16735f] shadow-sm">
            <ChevronDown
              size={19}
              className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[#16735f]">
              {typeLabel}
            </span>
            <span className="mt-1 block text-2xl font-black text-[#121826]">{section.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-[#5c667a]">
              <span>{section.matches.length} jogo{section.matches.length > 1 ? "s" : ""}</span>
              <span className="text-[#a0aaa4]">·</span>
              <span>primeiro: {firstKickoff}</span>
            </span>
          </span>
        </span>
        <span className="grid content-center gap-3">
          <span className="flex flex-wrap items-center gap-2 text-xs font-bold lg:justify-end">
            {openMatches > 0 ? (
              <span className="rounded-md border border-[#cfe0ff] bg-[#eef4ff] px-2.5 py-1.5 text-[#16735f]">
                {openMatches} aberto{openMatches > 1 ? "s" : ""}
              </span>
            ) : null}
            {liveMatches > 0 ? (
              <span className="rounded-md border border-[#f1ddb2] bg-[#fff3d7] px-2.5 py-1.5 text-[#9a6a18]">
                {liveMatches} ao vivo
              </span>
            ) : null}
            <span className="rounded-md border border-[#dbe4f0] bg-[#f4f7fb] px-2.5 py-1.5 text-[#5c667a]">
              {betMatches}/{section.matches.length} palpites
            </span>
          </span>
          <span className="grid gap-1">
            <span className="flex items-center justify-between text-xs font-semibold text-[#5c667a]">
              <span>Progresso dos palpites</span>
              <span>{predictionProgress}%</span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-[#e5ebf5]">
              <span
                className="block h-full rounded-full bg-[#16735f] transition-all"
                style={{ width: `${predictionProgress}%` }}
              />
            </span>
          </span>
        </span>
      </button>
      {isOpen ? (
        <div className="grid gap-3 border-t border-[#e4ebf5] bg-[#f7f9fd] p-3 sm:p-4">
          {section.matches.map((match) => (
            <MatchBetForm
              key={match._id}
              match={match}
              isMobileOpen={openMobileMatches.has(match._id)}
              onToggle={() => onMatchToggle(match._id)}
            />
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
              row: "border-[#e4ebf5] bg-white",
              badge: "bg-[#f4f7fb] text-[#5c667a]",
              icon: "text-[#5c667a]",
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
            <span className="rounded px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#5c667a]">
              {podium.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[#5c667a]">
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
        className="mt-2 h-10 w-full rounded-md border border-[#dbe4f0] bg-white px-3 outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4"
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

function MatchBetForm({
  match,
  isMobileOpen,
  onToggle,
}: {
  match: MatchRow;
  isMobileOpen: boolean;
  onToggle: () => void;
}) {
  const saveMatchBet = useMutation(api.betting.saveMatchBet);
  const savedHomeScore = match.bet?.homeScore;
  const savedAwayScore = match.bet?.awayScore;
  const [homeScore, setHomeScore] = useState(savedHomeScore ?? 0);
  const [awayScore, setAwayScore] = useState(savedAwayScore ?? 0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const isBettingOpen = match.displayStatus === "scheduled";
  const hasBet = match.bet !== null;
  const hasUnsavedChanges =
    isBettingOpen && (savedHomeScore !== homeScore || savedAwayScore !== awayScore);
  const isFinished = match.displayStatus === "finished";
  let feedback = hasBet ? "Palpite guardado" : "Escolhe o resultado";
  if (isFinished) {
    feedback = `${ (match.bet?.points ? '+' : '' ) + (match.bet?.points ?? 0)} pts`;
  } else if (!isBettingOpen) {
    feedback = hasBet ? `Palpite: ${savedHomeScore} - ${savedAwayScore}` : "Sem palpite";
  } else if (saveState === "saving") {
    feedback = "A guardar...";
  } else if (saveState === "saved") {
    feedback = "Guardado";
  } else if (saveState === "dirty") {
    feedback = "Alteracoes por guardar";
  } else if (saveState === "error") {
    feedback = message || "Nao foi possivel guardar.";
  }

  async function savePrediction() {
    if (!isBettingOpen || !hasUnsavedChanges) return;
    setSaveState("saving");
    setMessage("");
    try {
      await saveMatchBet({
        matchId: match._id,
        homeScore,
        awayScore,
      });
      setSaveState("saved");
    } catch (caught) {
      setSaveState("error");
      setMessage(caught instanceof Error ? caught.message : "Nao foi possivel guardar.");
    }
  }

  function markEditing(nextHomeScore: number, nextAwayScore: number) {
    setMessage("");
    setSaveState(
      savedHomeScore === nextHomeScore && savedAwayScore === nextAwayScore ? "idle" : "dirty",
    );
  }

  function updateHomeScore(nextValue: number) {
    const nextScore = Math.max(0, nextValue);
    markEditing(nextScore, awayScore);
    setHomeScore(nextScore);
  }

  function updateAwayScore(nextValue: number) {
    const nextScore = Math.max(0, nextValue);
    markEditing(homeScore, nextScore);
    setAwayScore(nextScore);
  }

  return (
    <article className="overflow-hidden rounded-lg border border-[#d7e1d3] bg-white shadow-sm transition hover:border-[#b9cab4] hover:shadow-md">
      <div className="grid gap-3 p-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <TeamMatchSide align="left" name={match.homeTeam} code={match.homeTeamCode} />

        <div
          className={`rounded-lg border p-2 shadow-inner lg:min-w-[230px] ${
            !isBettingOpen && !isFinished && !hasBet
              ? "border-[#f1ddb2] bg-[#fffaf0]"
              : "border-[#dbe4f0] bg-[#f7f9fd]"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            {isFinished ? (
              <ResultScore homeScore={match.homeScore} awayScore={match.awayScore} />
            ) : !isBettingOpen ? (
              <PredictionScore bet={match.bet} />
            ) : (
              <ScoreStepper
                homeScore={homeScore}
                awayScore={awayScore}
                homeTeam={match.homeTeam}
                awayTeam={match.awayTeam}
                disabled={!isBettingOpen}
                onHomeChange={updateHomeScore}
                onAwayChange={updateAwayScore}
              />
            )}
          </div>
          {isFinished ? (
            <div className="mt-2 flex justify-center">
              <span className="rounded-md bg-[#f5c542] px-3 py-1 text-sm font-black text-[#16735F]">
                {feedback}
              </span>
            </div>
          ) : (
            <p
              className={`mt-2 text-center text-xs font-semibold ${
                saveState === "error"
                  ? "text-[#9a3a18]"
                  : saveState === "saved"
                    ? "text-[#00a86b]"
                    : saveState === "dirty"
                      ? "text-[#9a6a18]"
                      : "text-[#5c667a]"
              }`}
            >
              {feedback}
            </p>
          )}
          {isBettingOpen ? (
            <button
              type="button"
              onClick={() => void savePrediction()}
              disabled={!hasUnsavedChanges || saveState === "saving"}
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#f5c542] px-3 text-sm font-bold text-[#16735F] hover:bg-[#e8b92f] disabled:bg-[#d8dee9] disabled:text-[#6b7280]"
            >
              {saveState === "saving" ? (
                <Loader2 className="animate-spin" size={15} />
              ) : null}
              Guardar palpite
            </button>
          ) : null}
        </div>

        <TeamMatchSide align="right" name={match.awayTeam} code={match.awayTeamCode} />

        <div className="flex flex-wrap items-center gap-2 border-t border-[#e4ebf5] pt-3 text-xs font-semibold text-[#5c667a] lg:col-span-3">
          <MatchStatePill status={match.displayStatus} kickoffAt={match.kickoffAt} />
          
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto rounded px-2 py-1 text-[#16735f] hover:bg-[#eef4ff] md:hidden"
            aria-expanded={isMobileOpen}
          >
            {isMobileOpen ? "Menos info" : "Mais info"}
          </button>
        </div>

        {isMobileOpen ? (
          <div className="rounded-md border border-[#e4ebf5] bg-[#f7f9fd] px-3 py-2 text-sm text-[#5c667a] md:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span>{formatKickoff(match.kickoffAt)}</span>
            </div>
            <p className="mt-1 font-semibold text-[#121826]">
              {isFinished ? `Ganhaste ${feedback}` : feedback}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TeamMatchSide({
  name,
  code,
  align,
}: {
  name: string;
  code?: string;
  align: "left" | "right";
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-3 ${align === "right" ? "md:flex-row-reverse md:text-right" : ""}`}
    >
      <FlagTile code={code} name={name} />
      <span className="min-w-0">
        <span className="block truncate text-base font-bold text-[#121826]">{name}</span>
        <span className="mt-1 inline-flex rounded bg-[#f4f7fb] px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#5c667a]">
          {code ?? "TBD"}
        </span>
      </span>
    </span>
  );
}

function ScoreStepper({
  homeScore,
  awayScore,
  homeTeam,
  awayTeam,
  disabled,
  onHomeChange,
  onAwayChange,
}: {
  homeScore: number;
  awayScore: number;
  homeTeam: string;
  awayTeam: string;
  disabled: boolean;
  onHomeChange: (value: number) => void;
  onAwayChange: (value: number) => void;
}) {
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
      <ScoreStepperSide
        label={homeTeam}
        value={homeScore}
        disabled={disabled}
        onChange={onHomeChange}
      />
      <span className="text-lg font-black text-[#5c667a]">-</span>
      <ScoreStepperSide
        label={awayTeam}
        value={awayScore}
        disabled={disabled}
        onChange={onAwayChange}
      />
    </div>
  );
}

function ScoreStepperSide({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 0}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[#dbe4f0] bg-white text-[#16735f] hover:bg-[#eef4ff] disabled:bg-[#eef2f7] disabled:text-[#a1a9b8]"
        aria-label={`Diminuir golos de ${label}`}
      >
        <Minus size={15} />
      </button>
      <output
        aria-label={`Golos de ${label}`}
        className="flex h-10 min-w-11 items-center justify-center rounded-md bg-[#16735F] px-3 text-xl font-black text-white shadow-inner"
      >
        {value}
      </output>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[#dbe4f0] bg-white text-[#16735f] hover:bg-[#eef4ff] disabled:bg-[#eef2f7] disabled:text-[#a1a9b8]"
        aria-label={`Aumentar golos de ${label}`}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

function ResultScore({
  homeScore,
  awayScore,
}: {
  homeScore?: number;
  awayScore?: number;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#16735F] px-3 text-2xl font-black text-white">
        {homeScore ?? "-"}
      </span>
      <span className="text-lg font-black text-[#5c667a]">-</span>
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#16735F] px-3 text-2xl font-black text-white">
        {awayScore ?? "-"}
      </span>
    </div>
  );
}

function PredictionScore({
  bet,
}: {
  bet: MatchRow["bet"];
}) {
  return bet ? (
    <div className="flex items-center justify-center gap-3">
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#f4f7fb] px-3 text-2xl font-black text-[#121826]">
        {bet.homeScore}
      </span>
      <span className="text-lg font-black text-[#5c667a]">-</span>
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#f4f7fb] px-3 text-2xl font-black text-[#121826]">
        {bet.awayScore}
      </span>
    </div>
  ) : (
    <div className="relative flex items-center justify-center gap-3 rounded-md border border-dashed border-[#f1ddb2] bg-white/60 px-3 py-2">
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#f4f7fb] px-3 text-2xl font-black text-[#a1a9b8]">
        -
      </span>
      <span className="text-lg font-black text-[#a1a9b8]">-</span>
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#f4f7fb] px-3 text-2xl font-black text-[#a1a9b8]">
        -
      </span>
      <span className="absolute rounded-md bg-[#fff3d7] px-2 py-1 text-xs font-black uppercase tracking-[0.1em] text-[#9a6a18] shadow-sm">
        Sem voto
      </span>
    </div>
  );
}

function MatchStatePill({
  status,
  kickoffAt,
}: {
  status: DisplayMatchStatus;
  kickoffAt: number;
}) {
  const style =
  status === "scheduled"
    ? {
        box: "border-blue-200 bg-blue-50 text-blue-700",
        dot: "bg-blue-500",
        label: "Agendado",
      }
    : status === "live"
      ? {
          box: "border-green-200 bg-green-50 text-green-700",
          dot: "bg-green-500",
          label: "Ao vivo",
        }
      : {
          box: "border-neutral-200 bg-neutral-50 text-neutral-500",
          dot: "bg-neutral-400",
          label: "Terminado",
        };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 ${style.box}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      <span>{style.label}</span>
      <span className="text-current/70">·</span>
      <CalendarDays size={13} />
      <span>{formatKickoff(kickoffAt)}</span>
    </span>
  );
}

function FlagTile({
  code,
  name,
}: {
  code?: string;
  name: string;
}) {
  const path = flagPath(code);

  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[#d8e2d4] bg-white p-1 shadow-sm"
    >
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={path}
          alt={`Bandeira ${name}`}
          className="h-full w-full rounded-[4px] object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-sm font-bold uppercase tracking-[0.12em] text-[#5c667a]">
          {code?.slice(0, 3) ?? "TBD"}
        </span>
      )}
    </span>
  );
}
