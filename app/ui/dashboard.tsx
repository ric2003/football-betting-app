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
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { displayStatusForPortugalTime, type DisplayMatchStatus } from "./match-status";

const teamSpecialFields = [
  ["worldCupWinnerTeamId", "Vencedor do Mundial"],
  ["mostGoalsTeamId", "Equipa com Mais Golos Marcados"],
  ["fewestConcededTeamId", "Equipa com Menos Golos Sofridos"],
] as const;

const playerSpecialFields = [
  ["mvpPlayerId", "MVP"],
  ["youngMvpPlayerId", "MVP Jovem"],
  ["topScorerPlayerId", "Melhor Marcador"],
  ["topAssisterPlayerId", "Melhor Assistente"],
] as const;

const numberSpecialFields = [
  ["ownGoals", "Número de Auto-Golos"],
  ["redCards", "Número de Cartões Vermelhos"],
] as const;

const stageLabels = {
  group: "Fase de Grupos",
  roundOf32: "16 Avos de Final",
  roundOf16: "Oitavos de Final",
  quarterFinal: "Quartos de Final",
  semiFinal: "Meias-Finais",
  thirdPlace: "3º Lugar",
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
  ALG: "dz",
  ARG: "ar",
  AUS: "au",
  AUT: "at",
  BEL: "be",
  BIH: "ba",
  BRA: "br",
  CAN: "ca",
  CIV: "ci",
  COD: "cd",
  COL: "co",
  CPV: "cv",
  CRO: "hr",
  CUW: "cw",
  CZE: "cz",
  ECU: "ec",
  EGY: "eg",
  ENG: "gb-eng",
  ESP: "es",
  FRA: "fr",
  GER: "de",
  GHA: "gh",
  HAI: "ht",
  IRN: "ir",
  IRQ: "iq",
  JOR: "jo",
  JPN: "jp",
  KOR: "kr",
  KSA: "sa",
  MAR: "ma",
  MEX: "mx",
  NED: "nl",
  NOR: "no",
  NZL: "nz",
  PAN: "pa",
  PAR: "py",
  POR: "pt",
  QAT: "qa",
  RSA: "za",
  SCO: "gb-sct",
  SEN: "sn",
  SUI: "ch",
  SWE: "se",
  TUN: "tn",
  TUR: "tr",
  URU: "uy",
  USA: "us",
  UZB: "uz",
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
  return section.key.startsWith("group-") ? "Grupo" : "Eliminatória";
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
      setSpecialMessage("Previsões Especiais guardadas.");
    } catch (caught) {
      setSpecialMessage(
        caught instanceof Error ? caught.message : "Não foi possível guardar.",
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
  const youngPlayerOptions = useMemo(() => {
    if (!catalog) return [];
    return "youngPlayers" in catalog && Array.isArray(catalog.youngPlayers)
      ? catalog.youngPlayers
      : catalog.players.filter((player) => player.isYoung);
  }, [catalog]);

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
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] dark:bg-background">
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
    <main className="min-h-screen bg-[#f6f7f2] pb-28 text-[#18201b] transition-colors dark:bg-background dark:text-foreground sm:pb-8">
      <header className="border-b border-[#dfe5dc] bg-white text-[#18201b] shadow-sm transition-colors dark:border-border dark:bg-card dark:text-card-foreground">
        <div className="h-1 bg-[#16735f]" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-[#d7ded3] bg-[#eaf4ef] text-[#16735f] transition-colors dark:border-border dark:bg-secondary dark:text-primary">
              <Trophy size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#16735f] dark:text-primary">
              World Cup Bets 2026
            </p>
              <h1 className="text-2xl font-semibold">{user?.username}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AnimatedThemeToggler
              aria-label="Alternar modo escuro"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d7ded3] bg-white text-[#16735f] transition hover:bg-[#eef2eb] dark:border-border dark:bg-secondary dark:text-foreground dark:hover:bg-accent [&_svg]:h-4 [&_svg]:w-4"
              variant="circle"
            />
            {user?.isAdmin ? (
              <Link
                href="/admin"
                className="flex h-10 items-center gap-2 rounded-md border border-[#d7ded3] bg-white px-3 text-sm font-semibold transition hover:bg-[#eef2eb] dark:border-border dark:bg-secondary dark:hover:bg-accent"
              >
                <Shield size={16} />
                Admin
              </Link>
            ) : null}
            <button
              onClick={() => void signOut()}
              className="flex h-10 items-center gap-2 rounded-md bg-[#16735f] px-3 text-sm font-bold text-white hover:bg-[#0f5d4d]"
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
            <section className="overflow-hidden rounded-lg border border-[#d7ded3] bg-white shadow-sm transition-colors dark:border-border dark:bg-card">
              <div className="relative border-b border-[#d7ded3] bg-[#16735f] px-5 py-6 text-white dark:border-border">
                <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:36px_36px]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
                <div className="absolute inset-x-0 bottom-0 h-1 bg-[#16735f]" />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
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
                  <p className="rounded-md border border-dashed border-[#cbd5c7] bg-[#fbfcfa] p-4 text-sm text-[#52605a] transition-colors dark:border-border dark:bg-secondary dark:text-muted-foreground">
                    Ainda não há jogos. Um admin pode criar equipas, jogadores e jogos.
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
                {sections.length > 0 ? (
                  <p className="mt-4 text-xs font-medium text-[#52605a] dark:text-muted-foreground">
                    {openSectionCount === 0
                      ? "Escolhe um grupo ou fase para abrir."
                      : `${openSectionCount} Secç${openSectionCount > 1 ? "ões" : "ão"} Aberta${openSectionCount > 1 ? "s" : ""}.`}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeView === "leaderboard" ? (
            <section className="rounded-lg border border-[#d7ded3] bg-white p-5 shadow-sm transition-colors dark:border-border dark:bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Crown className="text-[#16735f]" size={20} />
                  <h2 className="text-xl font-semibold">Leaderboard</h2>
                </div>
                <div className="rounded-md bg-[#eef2eb] px-3 py-2 text-sm font-semibold text-[#52605a] transition-colors dark:bg-secondary dark:text-muted-foreground">
                  {leaderboard.length} Jogador{leaderboard.length !== 1 ? "es" : ""}
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
            className="rounded-lg border border-[#d7ded3] bg-white p-5 transition-colors dark:border-border dark:bg-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Apostas Especiais</h2>
                <p className="text-sm text-[#52605a] dark:text-muted-foreground">
                  Disponíveis até ao início do primeiro jogo.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-[#fff3d7] px-3 py-2 text-sm font-semibold text-[#7b5613] dark:bg-[#33270d] dark:text-[#f5c542]">
                <Trophy size={16} />
                {data.specialPoints} pts
              </div>
            </div>
            {firstKickoffAt !== null ? (
              <p
                className={`mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                  specialBetsAreOpen
                    ? "bg-[#eaf4ef] text-[#16735f] dark:bg-[#103d32] dark:text-[#7ee0c3]"
                    : "bg-[#eef2eb] text-[#52605a] dark:bg-secondary dark:text-muted-foreground"
                }`}
              >
                {!specialBetsAreOpen ? <Lock size={15} /> : <CalendarDays size={15} />}
                {specialBetsAreOpen
                  ? `Fecham a ${formatKickoff(firstKickoffAt)}.`
                  : `Fecharam a ${formatKickoff(firstKickoffAt)}.`}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {teamSpecialFields.map(([name, label]) => (
                <OptionAutocomplete
                  key={`${name}-${data.specialBet?.[name] ?? ""}`}
                  name={name}
                  label={label}
                  options={catalog.teams}
                  defaultValue={data.specialBet?.[name] ?? ""}
                  disabled={!specialBetsAreOpen}
                />
              ))}
              {playerSpecialFields.map(([name, label]) => (
                <OptionAutocomplete
                  key={`${name}-${data.specialBet?.[name] ?? ""}`}
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
                    className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30"
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
                Guardar Apostas Especiais
              </button>
              {specialMessage ? (
                <span className="text-sm text-[#52605a] dark:text-muted-foreground">{specialMessage}</span>
              ) : null}
              {!canUseSpecials ? (
                <span className="text-sm text-[#9a6a18]">
                  {!specialBetsAreOpen
                    ? "As apostas especiais já estão fechadas."
                    : "É preciso configurar equipas, jogadores e jogadores jovens primeiro."}
                </span>
              ) : null}
            </div>
          </form>
          ) : null}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-[#d7ded3] bg-[#f6f7f2]/85 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-colors dark:border-border dark:bg-background/85 sm:hidden">
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
      meta: `${matchCount} Jogo${matchCount !== 1 ? "s" : ""}`,
      description: "Grupos, Fases e Apostas",
      icon: ListChecks,
      active: activeView === "games",
      accent: "#16735f",
      onClick: () => onViewChange("games"),
    },
    {
      id: "leaderboard",
      label: "Leaderboard",
      eyebrow: "Classificação",
      meta: `${leaderboardCount} Jogador${leaderboardCount !== 1 ? "es" : ""}`,
      description: "Pontos e Ranking da Liga",
      icon: Crown,
      active: activeView === "leaderboard",
      accent: "#16735f",
      onClick: () => onViewChange("leaderboard"),
    },
    {
      id: "specials",
      label: "Especiais",
      eyebrow: "Bola de Ouro",
      meta: `${specialPoints} pts`,
      description: "Campeão, MVP e Extras",
      icon: Trophy,
      active: activeView === "specials",
      accent: "#16735f",
      onClick: () => onViewChange("specials"),
    },
  ];

  return (
    <nav
      aria-label="Navegacao principal"
      className={
        compact
          ? "w-full max-w-sm rounded-2xl border border-[#d7ded3] bg-white/90 p-1.5 shadow-xl shadow-[#16735f]/15 backdrop-blur transition-colors dark:border-border dark:bg-card/90"
          : "rounded-2xl border border-[#d7ded3] bg-white/85 p-2 shadow-lg shadow-[#16735f]/10 backdrop-blur transition-colors dark:border-border dark:bg-card/85"
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
          ? "bg-white text-[#18201b] shadow-md dark:bg-accent dark:text-accent-foreground"
          : "bg-white text-[#52605a] hover:bg-[#fbfcfa] hover:text-[#18201b] dark:bg-secondary dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
      } ${compact ? "flex min-h-16 flex-col items-center justify-center px-2 py-2 text-center" : "flex min-h-20 items-center gap-3 px-4 py-3 text-left"}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 ${active ? "bg-[#16735f]" : "bg-[#d7ded3]"}`}
      />
      <span
        className={`flex shrink-0 items-center justify-center rounded-md ${
          compact ? "h-8 w-8" : "h-10 w-10"
        } ${active ? "bg-[#eaf4ef] dark:bg-background" : "bg-white dark:bg-card"}`}
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
        <span
          className={`${compact ? "text-[10px]" : "mt-0.5 block truncate text-xs"} ${
            active ? "text-[#52605a] dark:text-accent-foreground/70" : "text-[#52605a] dark:text-muted-foreground"
          }`}
        >
          {compact ? meta : description}
        </span>
      </span>
      {!compact ? (
        <span
          className={`absolute right-4 top-4 rounded-md px-2 py-1 text-xs font-bold ${
            active
              ? "bg-[#eef2eb] text-[#52605a] dark:bg-background dark:text-accent-foreground/70"
              : "bg-white text-[#52605a] dark:bg-card dark:text-muted-foreground"
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
}: {
  section: MatchSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const openMatches = section.matches.filter((match) => match.displayStatus === "scheduled").length;
  const liveMatches = section.matches.filter((match) => match.displayStatus === "live").length;
  const betMatches = section.matches.filter((match) => match.bet !== null).length;
  const firstKickoff = formatKickoff(section.matches[0].kickoffAt);
  const typeLabel = sectionTypeLabel(section);

  return (
    <section className="overflow-hidden rounded-lg border border-[#d7ded3] bg-white shadow-sm transition-colors dark:border-border dark:bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="group relative grid w-full gap-4 overflow-hidden px-4 py-4 text-left transition hover:bg-[#f8faf6] dark:hover:bg-accent lg:grid-cols-[1fr_320px]"
        aria-expanded={isOpen}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-[#16735f]" />
        <span className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#d7ded3] bg-[#eaf4ef] text-[#16735f] shadow-sm transition-colors dark:border-border dark:bg-secondary dark:text-primary">
            <ChevronDown
              size={19}
              className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[#16735f] dark:text-primary">
              {typeLabel}
            </span>
            <span className="mt-1 block text-2xl font-black text-[#18201b] dark:text-foreground">{section.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-[#52605a] dark:text-muted-foreground">
              <span>{section.matches.length} Jogo{section.matches.length > 1 ? "s" : ""}</span>
              <span className="text-[#8a958f]">·</span>
              <span>Primeiro: {firstKickoff}</span>
            </span>
          </span>
        </span>
        <span className="grid content-center gap-3">
          <span className="flex flex-wrap items-center gap-2 text-xs font-bold lg:justify-end">
            {openMatches > 0 ? (
              <span className="rounded-md border border-[#d7ded3] bg-[#eaf4ef] px-2.5 py-1.5 text-[#16735f] transition-colors dark:border-border dark:bg-secondary dark:text-primary">
                {openMatches} Aberto{openMatches > 1 ? "s" : ""}
              </span>
            ) : null}
            {liveMatches > 0 ? (
              <span className="rounded-md border border-[#f1ddb2] bg-[#fff3d7] px-2.5 py-1.5 text-[#9a6a18] dark:border-[#9a6a18]/50 dark:bg-[#33270d] dark:text-[#f5c542]">
                {liveMatches} Ao vivo
              </span>
            ) : null}
            <span className="rounded-md border border-[#d7ded3] bg-[#eef2eb] px-2.5 py-1.5 text-[#52605a] transition-colors dark:border-border dark:bg-secondary dark:text-muted-foreground">
              {betMatches}/{section.matches.length} Palpites
            </span>
          </span>
        </span>
      </button>
      {isOpen ? (
        <div className="grid gap-3 border-t border-[#edf1ea] bg-[#fbfcfa] p-3 transition-colors dark:border-border dark:bg-background sm:p-4">
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
          row: "border-[#e0b72c] bg-[#fff5cf] dark:border-[#f4c430]/55 dark:bg-[#2f250b] dark:text-[#fff4c7]",
          badge: "bg-[#f4c430] text-[#3e2f06] dark:bg-[#f5c542] dark:text-[#1f1704]",
          icon: "text-[#8a6500] dark:text-[#f5c542]",
          label: "Campeão",
        }
      : rank === 2
        ? {
            row: "border-[#c9ced3] bg-[#f2f4f5] dark:border-[#9aa3ad]/55 dark:bg-[#242a30] dark:text-[#eef2f4]",
            badge: "bg-[#c7cdd2] text-[#283039] dark:bg-[#b9c1c9] dark:text-[#171b20]",
            icon: "text-[#68727c] dark:text-[#c7d0d8]",
            label: "Segundo",
          }
        : rank === 3
          ? {
              row: "border-[#c98f5a] bg-[#fff0e2] dark:border-[#c68147]/60 dark:bg-[#2d1f16] dark:text-[#ffe4cf]",
              badge: "bg-[#c68147] text-white dark:bg-[#d3915a] dark:text-[#1f1209]",
              icon: "text-[#8a4f23] dark:text-[#dca36f]",
              label: "Terceiro",
            }
          : {
              row: "border-[#edf1ea] bg-white dark:border-border dark:bg-card",
              badge: "bg-[#eef2eb] text-[#52605a] dark:bg-secondary dark:text-muted-foreground",
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
            <span className="rounded px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#52605a] dark:bg-background/30 dark:text-current/70">
              {podium.label}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[#52605a] dark:text-muted-foreground">
          Jogos {row.matchPoints} · Exatos {row.exactMatches} · Especiais {row.specialPoints}
        </p>
      </div>
      <div className="flex items-center gap-2 justify-self-start rounded-md bg-white/70 px-3 py-2 font-semibold dark:bg-background/45 sm:justify-self-end">
        <Medal className={podium.icon} size={18} />
        {row.totalPoints} pts
      </div>
    </div>
  );
}

function OptionAutocomplete({
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
  const inputId = useId();
  const dropdownId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultOption = options.find((option) => option.id === defaultValue);
  const [inputValue, setInputValue] = useState(defaultOption?.label ?? "");
  const [selectedId, setSelectedId] = useState(defaultOption?.id ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLocaleLowerCase("pt-PT");
    if (!query) return options;
    return options.filter((option) =>
      option.label.toLocaleLowerCase("pt-PT").includes(query),
    );
  }, [inputValue, options]);

  function setAutocompleteValidity(value: string, optionId: string) {
    inputRef.current?.setCustomValidity(
      value && !optionId ? "Escolhe uma opção da lista." : "",
    );
  }

  function selectOption(option: { id: string; label: string }) {
    setInputValue(option.label);
    setSelectedId(option.id);
    setIsOpen(false);
    setAutocompleteValidity(option.label, option.id);
  }

  return (
    <div className={`relative block ${isOpen ? "z-[100]" : ""}`}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={inputValue}
        disabled={disabled}
        placeholder="Começa a escrever..."
        autoComplete="off"
        role="combobox"
        aria-controls={dropdownId}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && filteredOptions[highlightedIndex]
            ? `${dropdownId}-${filteredOptions[highlightedIndex].id}`
            : undefined
        }
        onFocus={() => {
          setHighlightedIndex(0);
          setIsOpen(true);
        }}
        onChange={(event) => {
          const value = event.currentTarget.value;
          const option = options.find((item) => item.label === value);
          const optionId = option?.id ?? "";
          setInputValue(value);
          setSelectedId(optionId);
          setHighlightedIndex(0);
          setIsOpen(true);
          setAutocompleteValidity(value, optionId);
        }}
        onKeyDown={(event) => {
          if (!isOpen && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
            setIsOpen(true);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((current) =>
              filteredOptions.length === 0 ? 0 : Math.min(current + 1, filteredOptions.length - 1),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && isOpen) {
            const option = filteredOptions[highlightedIndex];
            if (option) {
              event.preventDefault();
              selectOption(option);
            }
          } else if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
        onBlur={() => {
          setAutocompleteValidity(inputValue, selectedId);
          window.setTimeout(() => setIsOpen(false), 100);
        }}
        className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 focus:border-[#16735f] focus:ring-4 disabled:bg-[#eef2eb] disabled:text-[#8a958f] dark:border-border dark:bg-input/30 dark:text-foreground"
        required
      />
      <input name={name} type="hidden" value={selectedId} disabled={disabled} readOnly />
      {isOpen && !disabled ? (
        <div
          id={dropdownId}
          role="listbox"
          className="absolute left-0 right-0 z-[100] mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-[#d7ded3] bg-white py-1 text-sm text-[#18201b] shadow-xl dark:border-border dark:bg-popover dark:text-popover-foreground"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <button
                key={option.id}
                id={`${dropdownId}-${option.id}`}
                type="button"
                role="option"
                aria-selected={selectedId === option.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(option)}
                className={`block w-full px-3 py-2 text-left focus:outline-none ${
                  highlightedIndex === index || selectedId === option.id
                    ? "bg-[#eef2eb] dark:bg-accent"
                    : "hover:bg-[#eef2eb] dark:hover:bg-accent"
                }`}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-[#52605a] dark:text-muted-foreground">
              Sem Resultados
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MatchBetForm({
  match,
}: {
  match: MatchRow;
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
  let feedback = hasBet ? "Aposta Guardada" : "Escolhe o Resultado";
  if (isFinished) {
    feedback = `${ (match.bet?.points ? '+' : '' ) + (match.bet?.points ?? 0)} pts`;
  } else if (!isBettingOpen) {
    feedback = hasBet ? `Aposta: ${savedHomeScore} - ${savedAwayScore}` : "Sem Aposta";
  } else if (saveState === "saving") {
    feedback = "A guardar...";
  } else if (saveState === "saved") {
    feedback = "Guardado";
  } else if (saveState === "dirty") {
    feedback = "Alterações por guardar";
  } else if (saveState === "error") {
    feedback = message || "Não foi possível guardar.";
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
      setMessage(caught instanceof Error ? caught.message : "Não foi possível guardar.");
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
    <article className="overflow-hidden rounded-lg border border-[#d7e1d3] bg-white shadow-sm transition hover:border-[#b9cab4] hover:shadow-md dark:border-border dark:bg-card dark:hover:border-ring">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-3 sm:gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <TeamMatchSide align="left" name={match.homeTeam} code={match.homeTeamCode} />

        <div
          className={`min-w-0 rounded-lg border p-2 shadow-inner lg:min-w-[230px] ${
            !isBettingOpen && !isFinished && !hasBet
              ? "border-[#f1ddb2] bg-[#fffaf0] dark:border-[#9a6a18]/50 dark:bg-[#2a2114]"
              : "border-[#d7ded3] bg-[#fbfcfa] dark:border-border dark:bg-secondary"
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
              <span className="rounded-md border border-[#c7dfd6] bg-[#eaf4ef] px-3 py-1 text-sm font-black text-[#16735f] dark:border-[#2f8a73]/60 dark:bg-[#103d32] dark:text-[#7ee0c3]">
                {feedback}
              </span>
            </div>
          ) : (
            <p
              className={`mt-2 text-center text-xs font-semibold ${
                saveState === "error"
                  ? "text-[#9a3a18]"
                  : saveState === "saved"
                    ? "text-[#16735f]"
                    : saveState === "dirty"
                      ? "text-[#9a6a18]"
                      : "text-[#52605a] dark:text-muted-foreground"
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
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#16735f] px-3 text-sm font-bold text-white hover:bg-[#0f5d4d] disabled:bg-[#eef2eb] disabled:text-[#8a958f] dark:disabled:bg-secondary dark:disabled:text-muted-foreground"
            >
              {saveState === "saving" ? (
                <Loader2 className="animate-spin" size={15} />
              ) : null}
              Guardar Aposta
            </button>
          ) : null}
        </div>

        <TeamMatchSide align="right" name={match.awayTeam} code={match.awayTeamCode} />

        <div className="col-span-3 flex flex-wrap items-center gap-2 border-t border-[#edf1ea] pt-3 text-xs font-semibold text-[#52605a] dark:border-border dark:text-muted-foreground">
          <MatchStatePill status={match.displayStatus} kickoffAt={match.kickoffAt} />
        </div>
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
      className={`flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left ${
        align === "right" ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      <FlagTile code={code} name={name} />
      <span className="min-w-0 max-w-full">
        <span className="block truncate text-xs font-bold text-[#18201b] dark:text-foreground sm:text-base">{name}</span>
        <span className="mt-1 inline-flex rounded bg-[#eef2eb] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#52605a] dark:bg-secondary dark:text-muted-foreground sm:px-2 sm:py-1 sm:text-xs">
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
      <span className="text-lg font-black text-[#52605a] dark:text-muted-foreground">-</span>
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
        className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d7ded3] bg-white text-[#16735f] hover:bg-[#eef2eb] disabled:bg-[#eef2eb] disabled:text-[#8a958f] dark:border-border dark:bg-card dark:text-primary dark:hover:bg-accent dark:disabled:bg-secondary dark:disabled:text-muted-foreground sm:h-8 sm:w-8"
        aria-label={`Diminuir golos de ${label}`}
      >
        <Minus size={15} />
      </button>
      <output
        aria-label={`Golos de ${label}`}
        className="flex h-8 min-w-8 items-center justify-center rounded-md bg-[#16735f] px-1.5 text-base font-black text-white shadow-inner sm:h-10 sm:min-w-11 sm:px-3 sm:text-xl"
      >
        {value}
      </output>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        className="flex h-6 w-6 items-center justify-center rounded-md border border-[#d7ded3] bg-white text-[#16735f] hover:bg-[#eef2eb] disabled:bg-[#eef2eb] disabled:text-[#8a958f] dark:border-border dark:bg-card dark:text-primary dark:hover:bg-accent dark:disabled:bg-secondary dark:disabled:text-muted-foreground sm:h-8 sm:w-8"
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
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#16735f] px-3 text-2xl font-black text-white">
        {homeScore ?? "-"}
      </span>
      <span className="text-lg font-black text-[#52605a] dark:text-muted-foreground">-</span>
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#16735f] px-3 text-2xl font-black text-white">
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
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#eef2eb] px-3 text-2xl font-black text-[#18201b] dark:bg-secondary dark:text-foreground">
        {bet.homeScore}
      </span>
      <span className="text-lg font-black text-[#52605a] dark:text-muted-foreground">-</span>
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#eef2eb] px-3 text-2xl font-black text-[#18201b] dark:bg-secondary dark:text-foreground">
        {bet.awayScore}
      </span>
    </div>
  ) : (
    <div className="relative flex items-center justify-center gap-3 rounded-md border border-dashed border-[#f1ddb2] bg-white/60 px-3 py-2 dark:border-[#9a6a18]/50 dark:bg-[#241c11]">
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#eef2eb] px-3 text-2xl font-black text-[#8a958f] dark:bg-[#342816] dark:text-[#bfa56f]">
        -
      </span>
      <span className="text-lg font-black text-[#8a958f] dark:text-[#bfa56f]">-</span>
      <span className="flex h-11 min-w-12 items-center justify-center rounded-md bg-[#eef2eb] px-3 text-2xl font-black text-[#8a958f] dark:bg-[#342816] dark:text-[#bfa56f]">
        -
      </span>
      <span className="absolute rounded-md bg-[#fff3d7] px-2 py-1 text-xs font-black uppercase tracking-[0.1em] text-[#9a6a18] shadow-sm dark:bg-[#5a3d10] dark:text-[#ffd978]">
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
        box: "border-[#d7ded3] bg-[#eaf4ef] text-[#16735f] dark:border-[#2f8a73]/60 dark:bg-[#103d32] dark:text-[#7ee0c3]",
        dot: "bg-[#16735f] dark:bg-[#7ee0c3]",
        label: "Agendado",
      }
    : status === "live"
      ? {
          box: "border-[#d7ded3] bg-[#eaf4ef] text-[#16735f] dark:border-[#2f8a73]/60 dark:bg-[#103d32] dark:text-[#7ee0c3]",
          dot: "bg-[#16735f] dark:bg-[#7ee0c3]",
          label: "Ao vivo",
        }
      : {
          box: "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-border dark:bg-secondary dark:text-muted-foreground",
          dot: "bg-neutral-400 dark:bg-muted-foreground",
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#d8e2d4] bg-white p-1 shadow-sm dark:border-border dark:bg-card sm:h-14 sm:w-14"
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
        <span className="text-sm font-bold uppercase tracking-[0.12em] text-[#52605a] dark:text-muted-foreground">
          {code?.slice(0, 3) ?? "TBD"}
        </span>
      )}
    </span>
  );
}
