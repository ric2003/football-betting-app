"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Save,
  Shield,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { displayStatusForPortugalTime, type DisplayMatchStatus } from "./match-status";

const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

const stages = [
  ["group", "Fase de grupos"],
  ["roundOf32", "16 avos de final"],
  ["roundOf16", "Oitavos de final"],
  ["quarterFinal", "Quartos de final"],
  ["semiFinal", "Meias-finais"],
  ["thirdPlace", "3o lugar"],
  ["final", "Final"],
] as const;

const statuses = [
  ["scheduled", "Agendado"],
  ["finished", "Terminado"],
] as const;

const displayStatuses = {
  scheduled: "Agendado",
  live: "Ao vivo",
  finished: "Terminado",
} as const;

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

const multiAnswerSpecialFields = new Set([
  "topScorerPlayerId",
  "topAssisterPlayerId",
  "mostGoalsTeamId",
  "fewestConcededTeamId",
]);

const knockoutStageOrder: Array<MatchRow["stage"]> = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "thirdPlace",
  "final",
];

type AdminCatalogTab = "teams" | "players" | "games";

type TeamRow = {
  _id: Id<"teams">;
  name: string;
  code?: string;
  group?: (typeof groups)[number];
};

type PlayerRow = {
  _id: Id<"players">;
  name: string;
  teamId: Id<"teams">;
  teamName: string;
  isYoung: boolean;
};

type MatchRow = {
  _id: Id<"matches">;
  homeTeamId: Id<"teams">;
  awayTeamId: Id<"teams">;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: number;
  stage: (typeof stages)[number][0];
  group?: (typeof groups)[number];
  status: (typeof statuses)[number][0];
  displayStatus: DisplayMatchStatus;
  homeScore?: number;
  awayScore?: number;
};

type MatchSection = {
  key: string;
  title: string;
  order: number;
  matches: MatchRow[];
};

type CatalogOption = {
  id: string;
  label: string;
};

function toOptionalGroup(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text ? (text as (typeof groups)[number]) : undefined;
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return Number.parseInt(text, 10);
}

function formDataIds<T extends "teams" | "players">(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value))
    .filter(Boolean) as Array<Id<T>>;
}

function specialResultIds<T extends "teams" | "players">(
  value: Id<T> | Array<Id<T>> | undefined,
) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function dateTimeLocal(value: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
}

function portugalOffsetMs(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const portugalAsUtc = Date.UTC(
    Number(byType.year),
    Number(byType.month) - 1,
    Number(byType.day),
    Number(byType.hour),
    Number(byType.minute),
    Number(byType.second),
  );
  return portugalAsUtc - timestamp;
}

function parsePortugalDateTime(value: string) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  return timestamp - portugalOffsetMs(timestamp);
}

function formatKickoff(value: number) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(value);
}

function portugalDateParts(value: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
}

function formatRelativeKickoff(value: number, now: number) {
  const date = portugalDateParts(value);
  const currentDate = portugalDateParts(now);
  const valueDay = Date.UTC(date.year, date.month - 1, date.day);
  const currentDay = Date.UTC(currentDate.year, currentDate.month - 1, currentDate.day);
  const dayDifference = Math.round((valueDay - currentDay) / 86_400_000);
  const time = new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(value);

  if (dayDifference === 0) return `hoje, ${time}`;
  if (dayDifference === 1) return `amanha, ${time}`;

  return formatKickoff(value);
}

function groupMatchSections(matches: MatchRow[]) {
  const sections = new Map<string, MatchSection>();

  for (const match of matches) {
    const isGroup = match.stage === "group";
    const group = match.group ?? "?";
    const key = isGroup ? `group-${group}` : match.stage;
    const title = isGroup ? `Grupo ${group}` : stages.find(([stage]) => stage === match.stage)?.[1] ?? match.stage;
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

function sectionScheduleLabel(section: MatchSection, now: number) {
  const nextMatch = section.matches.find((match) => match.kickoffAt >= now);
  if (nextMatch) return `proximo: ${formatRelativeKickoff(nextMatch.kickoffAt, now)}`;

  return "sem jogos futuros";
}

export function AdminPanel() {
  const data = useQuery(api.betting.adminData);
  const createTeam = useMutation(api.betting.createTeam);
  const createPlayer = useMutation(api.betting.createPlayer);
  const createMatch = useMutation(api.betting.createMatch);
  const setSpecialResults = useMutation(api.betting.setSpecialResults);
  const [teamMessage, setTeamMessage] = useState("");
  const [playerMessage, setPlayerMessage] = useState("");
  const [matchMessage, setMatchMessage] = useState("");
  const [specialMessage, setSpecialMessage] = useState("");
  const [activeCatalogTab, setActiveCatalogTab] = useState<AdminCatalogTab>("games");
  const [openMatchSections, setOpenMatchSections] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const teams = useMemo(() => (data ? (data.teams as TeamRow[]) : []), [data]);
  const players = useMemo(() => (data ? (data.players as PlayerRow[]) : []), [data]);
  const matches = useMemo(
    () =>
      data
        ? (data.matches as MatchRow[]).map((match) => ({
            ...match,
            displayStatus: displayStatusForPortugalTime(match, now),
          }))
        : [],
    [data, now],
  );
  const youngPlayers = useMemo(
    () => players.filter((player) => player.isYoung),
    [players],
  );
  const teamOptions = useMemo(
    () =>
      teams.map((team) => ({
        id: team._id,
        label: team.code ? `${team.name} (${team.code})` : team.name,
      })),
    [teams],
  );
  const playerOptions = useMemo(
    () =>
      players.map((player) => ({
        id: player._id,
        label: `${player.name} - ${player.teamName}${player.isYoung ? " - jovem" : ""}`,
      })),
    [players],
  );
  const youngPlayerOptions = useMemo(
    () =>
      youngPlayers.map((player) => ({
        id: player._id,
        label: `${player.name} - ${player.teamName} - jovem`,
      })),
    [youngPlayers],
  );
  const canCreateDependentRows = teams.length > 0;
  const canSetSpecials = teams.length > 0 && players.length > 0 && youngPlayers.length > 0;
  const matchSections = groupMatchSections(matches);

  async function withPending(action: string, task: () => Promise<void>) {
    setPending(action);
    try {
      await task();
    } finally {
      setPending("");
    }
  }

  async function onCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await withPending("team", async () => {
      try {
        await createTeam({
          name: String(formData.get("name") ?? ""),
          code: String(formData.get("code") ?? "") || undefined,
          group: toOptionalGroup(formData.get("group")),
        });
        form.reset();
        setTeamMessage("Equipa criada.");
      } catch (caught) {
        setTeamMessage(caught instanceof Error ? caught.message : "Erro ao criar equipa.");
      }
    });
  }

  async function onCreatePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await withPending("player", async () => {
      try {
        await createPlayer({
          name: String(formData.get("name") ?? ""),
          teamId: String(formData.get("teamId")) as Id<"teams">,
          isYoung: formData.get("isYoung") === "on",
        });
        form.reset();
        setPlayerMessage("Jogador criado.");
      } catch (caught) {
        setPlayerMessage(caught instanceof Error ? caught.message : "Erro ao criar jogador.");
      }
    });
  }

  async function onCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await withPending("match", async () => {
      try {
        await createMatch({
          homeTeamId: String(formData.get("homeTeamId")) as Id<"teams">,
          awayTeamId: String(formData.get("awayTeamId")) as Id<"teams">,
          kickoffAt: parsePortugalDateTime(String(formData.get("kickoffAt"))),
          stage: String(formData.get("stage")) as MatchRow["stage"],
          group: toOptionalGroup(formData.get("group")),
          status: String(formData.get("status")) as MatchRow["status"],
        });
        form.reset();
        setMatchMessage("Jogo criado.");
      } catch (caught) {
        setMatchMessage(caught instanceof Error ? caught.message : "Erro ao criar jogo.");
      }
    });
  }

  async function onSpecialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await withPending("special", async () => {
      try {
        await setSpecialResults({
          worldCupWinnerTeamId: String(formData.get("worldCupWinnerTeamId")) as Id<"teams">,
          mvpPlayerId: String(formData.get("mvpPlayerId")) as Id<"players">,
          youngMvpPlayerId: String(formData.get("youngMvpPlayerId")) as Id<"players">,
          topScorerPlayerId: formDataIds<"players">(formData, "topScorerPlayerId"),
          topAssisterPlayerId: formDataIds<"players">(formData, "topAssisterPlayerId"),
          mostGoalsTeamId: formDataIds<"teams">(formData, "mostGoalsTeamId"),
          fewestConcededTeamId: formDataIds<"teams">(formData, "fewestConcededTeamId"),
          ownGoals: toOptionalNumber(formData.get("ownGoals")) ?? 0,
          redCards: toOptionalNumber(formData.get("redCards")) ?? 0,
        });
        setSpecialMessage("Resultados especiais guardados.");
      } catch (caught) {
        setSpecialMessage(caught instanceof Error ? caught.message : "Erro ao guardar.");
      }
    });
  }

  if (data === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] transition-colors dark:bg-background">
        <Loader2 className="animate-spin text-[#16735f] dark:text-primary" size={28} />
      </main>
    );
  }

  if (data === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] px-4 text-[#18201b] transition-colors dark:bg-background dark:text-foreground">
        <section className="rounded-lg border border-[#d7ded3] bg-white p-6 text-center shadow-sm transition-colors dark:border-border dark:bg-card">
          <Shield className="mx-auto text-[#b43b2f]" size={28} />
          <h1 className="mt-3 text-xl font-semibold">Acesso reservado</h1>
          <p className="mt-2 text-sm text-[#52605a] dark:text-muted-foreground">
            Apenas administradores podem gerir resultados.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[#18201b] px-4 text-sm font-semibold text-white transition hover:bg-[#2b342f] dark:bg-primary dark:text-primary-foreground"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
        </section>
      </main>
    );
  }

  function toggleMatchSection(sectionKey: string) {
    setOpenMatchSections((current) => {
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
    <main className="min-h-screen bg-[#f6f7f2] text-[#18201b] transition-colors dark:bg-background dark:text-foreground">
      <header className="border-b border-[#dfe5dc] bg-white shadow-sm transition-colors dark:border-border dark:bg-card dark:text-card-foreground">
        <div className="h-1 bg-[#16735f]" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#16735f] dark:text-primary">
              Mundial Bet 2026
            </p>
            <h1 className="text-2xl font-semibold">Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <AnimatedThemeToggler
              aria-label="Alternar modo escuro"
              className="hidden h-10 w-10 items-center justify-center rounded-md border border-[#d7ded3] bg-white text-[#16735f] transition hover:bg-[#eef2eb] dark:border-border dark:bg-secondary dark:text-foreground dark:hover:bg-accent sm:flex [&_svg]:h-4 [&_svg]:w-4"
              variant="circle"
            />
            <Link
              href="/"
              className="flex h-10 items-center gap-2 rounded-md border border-[#d7ded3] bg-white px-3 text-sm font-semibold transition hover:bg-[#eef2eb] dark:border-border dark:bg-secondary dark:hover:bg-accent"
            >
              <ArrowLeft size={16} />
              Voltar ao painel
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-4">
          <StatTile icon={<Users size={18} />} label="Equipas" value={teams.length} />
          <StatTile icon={<User size={18} />} label="Jogadores" value={players.length} />
          <StatTile icon={<User size={18} />} label="Jovens" value={youngPlayers.length} />
          <StatTile icon={<ListChecks size={18} />} label="Jogos" value={matches.length} />
        </section>

        <section className="rounded-lg border border-[#d7ded3] bg-white p-5 shadow-sm transition-colors dark:border-border dark:bg-card">
          <SectionHeader
            title="Catalogo"
            description="Gere jogadores, equipas e jogos a partir de uma area unica."
          />

          <div className="mt-5 grid gap-2 rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-2 transition-colors dark:border-border dark:bg-background sm:grid-cols-3">
            <CatalogTabButton
              active={activeCatalogTab === "games"}
              icon={<ListChecks size={17} />}
              label="Jogos"
              meta={`${matches.length} jogos`}
              onClick={() => setActiveCatalogTab("games")}
            />
            <CatalogTabButton
              active={activeCatalogTab === "teams"}
              icon={<Users size={17} />}
              label="Equipas"
              meta={`${teams.length} equipas`}
              onClick={() => setActiveCatalogTab("teams")}
            />
            <CatalogTabButton
              active={activeCatalogTab === "players"}
              icon={<User size={17} />}
              label="Jogadores"
              meta={`${players.length} jogadores`}
              onClick={() => setActiveCatalogTab("players")}
            />
          </div>

          {activeCatalogTab === "teams" ? (
            <div className="mt-5 grid gap-5">
              <section className="rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-4 transition-colors dark:border-border dark:bg-background">
                <FormHeader icon={<Users size={18} />} title="Nova equipa" />
                <form onSubmit={onCreateTeam} className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_110px_auto]">
                  <Input name="name" label="Nome" required />
                  <Input name="code" label="Codigo" />
                  <GroupSelect name="group" label="Grupo" />
                  <IconSubmit pending={pending === "team"} label="Criar equipa" />
                </form>
                {teamMessage ? <StatusMessage text={teamMessage} /> : null}
              </section>

              <section className="min-w-0">
                <ListHeader title="Equipas" count={teams.length} />
                <div className="grid gap-2">
                  {teams.length === 0 ? <EmptyLine text="Sem equipas." /> : null}
                  {teams.map((team) => (
                    <TeamEditForm key={team._id} team={team} />
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeCatalogTab === "players" ? (
            <div className="mt-5 grid gap-5">
              <section className="rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-4 transition-colors dark:border-border dark:bg-background">
                <FormHeader icon={<User size={18} />} title="Novo jogador" />
                <form onSubmit={onCreatePlayer} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Input name="name" label="Nome" required />
                  <TeamSelect name="teamId" label="Equipa" teams={teams} required />
                  <CheckboxField name="isYoung" label="Jovem" />
                  <IconSubmit pending={pending === "player"} label="Criar jogador" disabled={!canCreateDependentRows} />
                </form>
                {playerMessage ? <StatusMessage text={playerMessage} /> : null}
              </section>

              <section className="min-w-0">
                <ListHeader title="Jogadores" count={players.length} />
                <div className="grid gap-2">
                  {players.length === 0 ? <EmptyLine text="Sem jogadores." /> : null}
                  {players.map((player) => (
                    <PlayerEditForm key={player._id} player={player} teams={teams} />
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeCatalogTab === "games" ? (
            <div className="mt-5 grid gap-5">
              <section className="rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-4 transition-colors dark:border-border dark:bg-background">
                <FormHeader icon={<Plus size={18} />} title="Criar jogo" />
                <form onSubmit={onCreateMatch} className="mt-4 grid gap-4 md:grid-cols-3">
                  <TeamSelect name="homeTeamId" label="Casa" teams={teams} required />
                  <TeamSelect name="awayTeamId" label="Fora" teams={teams} required />
                  <label className="block">
                    <span className="text-sm font-medium">Data</span>
                    <input
                      name="kickoffAt"
                      type="datetime-local"
                      className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground"
                      required
                    />
                  </label>
                  <MatchStageGroupFields />
                  <StatusSelect name="status" label="Estado" />
                  <button
                    type="submit"
                    disabled={pending === "match" || teams.length < 2}
                    className="mt-6 flex h-10 items-center justify-center gap-2 rounded-md bg-[#16735f] px-4 text-sm font-semibold text-white transition hover:bg-[#0f5d4d] disabled:opacity-60"
                  >
                    {pending === "match" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    Criar jogo
                  </button>
                </form>
                {matchMessage ? <StatusMessage text={matchMessage} /> : null}
              </section>

              <section>
                <ListHeader title="Jogos existentes" count={matches.length} />
                <div className="grid gap-2">
                  {matchSections.length === 0 ? <EmptyLine text="Sem jogos para gerir." /> : null}
                  {matchSections.map((section) => (
                    <AdminMatchSectionPanel
                      key={section.key}
                      section={section}
                      teams={teams}
                      isOpen={openMatchSections.has(section.key)}
                      now={now}
                      onToggle={() => toggleMatchSection(section.key)}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </section>

        <form
          onSubmit={onSpecialSubmit}
          className="rounded-lg border border-[#d7ded3] bg-white p-5 shadow-sm transition-colors dark:border-border dark:bg-card"
        >
          <SectionHeader
            title="Resultados especiais"
            description="Define os vencedores finais para calcular os pontos das apostas especiais."
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {teamSpecialFields.map(([name, label]) => (
              multiAnswerSpecialFields.has(name) ? (
                <MultiOptionAutocomplete
                  key={`${name}-${specialResultIds(data.specialResult?.[name]).join("-")}`}
                  name={name}
                  label={label}
                  options={teamOptions}
                  defaultValues={specialResultIds(data.specialResult?.[name])}
                  required
                />
              ) : (
                <OptionAutocomplete
                  key={`${name}-${data.specialResult?.[name] ?? ""}`}
                  name={name}
                  label={label}
                  options={teamOptions}
                  defaultValue={String(data.specialResult?.[name] ?? "")}
                  required
                />
              )
            ))}
            {playerSpecialFields.map(([name, label]) => (
              multiAnswerSpecialFields.has(name) ? (
                <MultiOptionAutocomplete
                  key={`${name}-${specialResultIds(data.specialResult?.[name]).join("-")}`}
                  name={name}
                  label={label}
                  options={playerOptions}
                  defaultValues={specialResultIds(data.specialResult?.[name])}
                  required
                />
              ) : (
                <OptionAutocomplete
                  key={`${name}-${data.specialResult?.[name] ?? ""}`}
                  name={name}
                  label={label}
                  options={name === "youngMvpPlayerId" ? youngPlayerOptions : playerOptions}
                  defaultValue={String(data.specialResult?.[name] ?? "")}
                  required
                />
              )
            ))}
            {numberSpecialFields.map(([name, label]) => (
              <Input
                key={name}
                name={name}
                label={label}
                type="number"
                min="0"
                defaultValue={data.specialResult?.[name] ?? 0}
                required
              />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending === "special" || !canSetSpecials}
              className="flex h-10 items-center gap-2 rounded-md bg-[#16735f] px-4 text-sm font-semibold text-white hover:bg-[#0f5d4d] disabled:opacity-60"
            >
              {pending === "special" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Guardar resultados
            </button>
            {specialMessage ? <span className="text-sm text-[#52605a] dark:text-muted-foreground">{specialMessage}</span> : null}
            {!canSetSpecials ? (
              <span className="text-sm text-[#9a6a18] dark:text-[#f5c542]">
                Configura equipas, jogadores e jovens primeiro.
              </span>
            ) : null}
          </div>
        </form>
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
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#d7ded3] bg-white px-4 py-3 shadow-sm transition-colors dark:border-border dark:bg-card">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#eaf4ef] text-[#16735f] transition-colors dark:bg-secondary dark:text-primary">
        {icon}
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#52605a] dark:text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[#52605a] dark:text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FormHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[#18201b] dark:text-foreground">
      <span className="text-[#16735f] dark:text-primary">{icon}</span>
      <h3 className="font-semibold">{title}</h3>
    </div>
  );
}

function ListHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#52605a] dark:text-muted-foreground">
        {title}
      </h3>
      <span className="rounded bg-[#eef2eb] px-2 py-1 text-xs font-semibold text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function StatusMessage({ text }: { text: string }) {
  return <p className="mt-3 text-sm font-medium text-[#52605a] dark:text-muted-foreground">{text}</p>;
}

function CatalogTabButton({
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
      className={`flex min-h-14 items-center gap-3 rounded-md px-4 py-3 text-left transition ${
        active
          ? "bg-[#16735f] text-white shadow-sm"
          : "text-[#52605a] hover:bg-[#eef2eb] hover:text-[#18201b] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          active ? "bg-white/15" : "bg-[#eef2eb] dark:bg-secondary"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className={`block text-xs ${active ? "text-white/80" : "text-[#718078] dark:text-muted-foreground"}`}>
          {meta}
        </span>
      </span>
    </button>
  );
}

function AdminMatchSectionPanel({
  section,
  teams,
  isOpen,
  now,
  onToggle,
}: {
  section: MatchSection;
  teams: TeamRow[];
  isOpen: boolean;
  now: number;
  onToggle: () => void;
}) {
  const liveMatches = section.matches.filter((match) => match.displayStatus === "live").length;
  const finishedMatches = section.matches.filter((match) => match.displayStatus === "finished").length;
  const scheduleLabel = sectionScheduleLabel(section, now);

  return (
    <section className="rounded-md border border-[#edf1ea] bg-white transition-colors dark:border-border dark:bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-[#f8faf6] dark:hover:bg-accent sm:grid-cols-[1fr_auto]"
        aria-expanded={isOpen}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eef2eb] text-[#16735f] dark:bg-secondary dark:text-primary">
            <ChevronDown
              size={17}
              className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{section.title}</span>
            <span className="block text-xs text-[#52605a] dark:text-muted-foreground">
              {section.matches.length} jogos · {scheduleLabel}
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#52605a] dark:text-muted-foreground sm:justify-end">
          {liveMatches > 0 ? (
            <span className="rounded bg-[#fff3d7] px-2 py-1 text-[#9a6a18] dark:bg-[#33270d] dark:text-[#f5c542]">
              {liveMatches} ao vivo
            </span>
          ) : null}
          {finishedMatches > 0 ? (
            <span className="rounded bg-[#eef2eb] px-2 py-1 text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
              {finishedMatches} terminado{finishedMatches > 1 ? "s" : ""}
            </span>
          ) : null}
        </span>
      </button>
      {isOpen ? (
        <div className="grid gap-3 border-t border-[#edf1ea] p-3 dark:border-border">
          {section.matches.map((match) => (
            <MatchEditForm key={match._id} match={match} teams={teams} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TeamEditForm({ team }: { team: TeamRow }) {
  const updateTeam = useMutation(api.betting.updateTeam);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    try {
      await updateTeam({
        teamId: team._id,
        name: String(formData.get("name") ?? ""),
        code: String(formData.get("code") ?? "") || undefined,
        group: toOptionalGroup(formData.get("group")),
      });
      setMessage("Guardado.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Erro.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-3 transition-colors dark:border-border dark:bg-background sm:grid-cols-[1fr_90px_90px_auto]">
      <Input name="name" label="Nome" defaultValue={team.name} required compact />
      <Input name="code" label="Codigo" defaultValue={team.code ?? ""} compact />
      <GroupSelect name="group" label="Grupo" defaultValue={team.group ?? ""} compact />
      <IconSubmit pending={pending} label="Atualizar equipa" icon="edit" />
      {message ? <p className="text-xs text-[#52605a] dark:text-muted-foreground sm:col-span-4">{message}</p> : null}
    </form>
  );
}

function PlayerEditForm({ player, teams }: { player: PlayerRow; teams: TeamRow[] }) {
  const updatePlayer = useMutation(api.betting.updatePlayer);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formData = new FormData(event.currentTarget);
    try {
      await updatePlayer({
        playerId: player._id,
        name: String(formData.get("name") ?? ""),
        teamId: String(formData.get("teamId")) as Id<"teams">,
        isYoung: formData.get("isYoung") === "on",
      });
      setMessage("Guardado.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Erro.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-3 transition-colors dark:border-border dark:bg-background sm:grid-cols-[1fr_1fr_100px_auto]">
      <Input name="name" label="Nome" defaultValue={player.name} required compact />
      <TeamSelect name="teamId" label="Equipa" teams={teams} defaultValue={player.teamId} required compact />
      <CheckboxField name="isYoung" label="Jovem" defaultChecked={player.isYoung} compact />
      <IconSubmit pending={pending} label="Atualizar jogador" icon="edit" />
      {message ? <p className="text-xs text-[#52605a] dark:text-muted-foreground sm:col-span-4">{message}</p> : null}
    </form>
  );
}

function MatchEditForm({ match, teams }: { match: MatchRow; teams: TeamRow[] }) {
  const updateMatch = useMutation(api.betting.updateMatch);
  const setMatchStatusAndResult = useMutation(api.betting.setMatchStatusAndResult);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const canTerminate = match.displayStatus === "live";

  async function onUpdateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("match");
    const formData = new FormData(event.currentTarget);
    try {
      await updateMatch({
        matchId: match._id,
        homeTeamId: String(formData.get("homeTeamId")) as Id<"teams">,
        awayTeamId: String(formData.get("awayTeamId")) as Id<"teams">,
        kickoffAt: parsePortugalDateTime(String(formData.get("kickoffAt"))),
        stage: String(formData.get("stage")) as MatchRow["stage"],
        group: toOptionalGroup(formData.get("group")),
        status: String(formData.get("status")) as MatchRow["status"],
        homeScore: toOptionalNumber(formData.get("homeScore")),
        awayScore: toOptionalNumber(formData.get("awayScore")),
      });
      setMessage("Jogo atualizado.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Erro ao atualizar.");
    } finally {
      setPending("");
    }
  }

  async function onTerminateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("terminate");
    const formData = new FormData(event.currentTarget);
    try {
      await setMatchStatusAndResult({
        matchId: match._id,
        status: "finished",
        homeScore: toOptionalNumber(formData.get("homeScore")),
        awayScore: toOptionalNumber(formData.get("awayScore")),
      });
      setMessage("Jogo terminado.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Erro ao terminar jogo.");
    } finally {
      setPending("");
    }
  }

  return (
    <section className="rounded-md border border-[#edf1ea] bg-[#fbfcfa] p-4 transition-colors dark:border-border dark:bg-background">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {match.homeTeam} vs {match.awayTeam}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#52605a] dark:text-muted-foreground">
            <CalendarDays size={16} />
            {formatKickoff(match.kickoffAt)}
            <span className="rounded bg-[#eef2eb] px-2 py-1 text-xs font-semibold text-[#52605a] dark:bg-secondary dark:text-muted-foreground">
              {displayStatuses[match.displayStatus]}
            </span>
          </div>
        </div>
      </div>
      <form onSubmit={onUpdateMatch} className="grid gap-3 md:grid-cols-4">
        <TeamSelect name="homeTeamId" label="Casa" teams={teams} defaultValue={match.homeTeamId} required compact />
        <TeamSelect name="awayTeamId" label="Fora" teams={teams} defaultValue={match.awayTeamId} required compact />
        <label className="block">
          <span className="text-xs font-medium">Data</span>
          <input
            name="kickoffAt"
            type="datetime-local"
            defaultValue={dateTimeLocal(match.kickoffAt)}
            className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 text-sm outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground"
            required
          />
        </label>
        <MatchStageGroupFields
          defaultStage={match.stage}
          defaultGroup={match.group ?? ""}
          compact
        />
        <StatusSelect name="status" label="Estado" defaultValue={match.status} compact />
        <Input name="homeScore" label="Casa" type="number" min="0" defaultValue={match.homeScore ?? ""} compact />
        <Input name="awayScore" label="Fora" type="number" min="0" defaultValue={match.awayScore ?? ""} compact />
        <button
          type="submit"
          disabled={pending === "match"}
          className="mt-6 flex h-10 items-center justify-center gap-2 rounded-md bg-[#16735f] px-3 text-sm font-semibold text-white transition hover:bg-[#0f5d4d] disabled:opacity-60"
        >
          {pending === "match" ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
          Guardar
        </button>
      </form>
      {canTerminate ? (
        <form
          onSubmit={onTerminateMatch}
          className="mt-3 grid gap-3 rounded-md border border-[#fff3d7] bg-[#fffaf0] p-3 transition-colors dark:border-[#9a6a18]/50 dark:bg-[#2a2114] md:grid-cols-[90px_90px_auto]"
        >
          <Input name="homeScore" label="Casa" type="number" min="0" compact required />
          <Input name="awayScore" label="Fora" type="number" min="0" compact required />
          <button
            type="submit"
            disabled={pending === "terminate"}
            className="mt-6 flex h-10 items-center justify-center gap-2 rounded-md bg-[#9a6a18] px-3 text-sm font-semibold text-white transition hover:bg-[#7b5613] disabled:opacity-60"
          >
            {pending === "terminate" ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            Terminar
          </button>
        </form>
      ) : null}
      {message ? <p className="mt-2 text-sm text-[#52605a] dark:text-muted-foreground">{message}</p> : null}
    </section>
  );
}

function Input({
  label,
  compact,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; compact?: boolean }) {
  return (
    <label className="block">
      <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</span>
      <input
        {...props}
        className={`mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 disabled:bg-[#eef2eb] disabled:text-[#8a958f] dark:border-border dark:bg-input/30 dark:text-foreground dark:disabled:bg-secondary dark:disabled:text-muted-foreground ${
          compact ? "text-sm" : ""
        }`}
      />
    </label>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
  compact,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className={compact ? "text-xs font-medium opacity-0" : "text-sm font-medium opacity-0"}>
        {label}
      </span>
      <span
        className={`mt-2 flex h-10 w-full items-center gap-2 rounded-md border border-[#d7ded3] bg-white px-3 transition-colors dark:border-border dark:bg-input/30 ${
          compact ? "text-sm" : ""
        }`}
      >
        <input
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          className="h-4 w-4 accent-[#16735f]"
        />
        <span className="font-medium">{label}</span>
      </span>
    </label>
  );
}

function OptionAutocomplete({
  name,
  label,
  options,
  defaultValue = "",
  required,
}: {
  name: string;
  label: string;
  options: CatalogOption[];
  defaultValue?: string;
  required?: boolean;
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
      value && !optionId ? "Escolhe uma opcao da lista." : "",
    );
  }

  function selectOption(option: CatalogOption) {
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
        placeholder="Comeca a escrever..."
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
        className="mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground"
        required={required}
      />
      <input name={name} type="hidden" value={selectedId} readOnly />
      {isOpen ? (
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
              Sem resultados
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MultiOptionAutocomplete({
  name,
  label,
  options,
  defaultValues = [],
  required,
}: {
  name: string;
  label: string;
  options: CatalogOption[];
  defaultValues?: string[];
  required?: boolean;
}) {
  const inputId = useId();
  const dropdownId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialSelected = defaultValues.filter((id) => options.some((option) => option.id === id));
  const [inputValue, setInputValue] = useState("");
  const [selectedIds, setSelectedIds] = useState(initialSelected);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const selectedOptions = selectedIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is CatalogOption => Boolean(option));
  const filteredOptions = useMemo(() => {
    const selected = new Set(selectedIds);
    const query = inputValue.trim().toLocaleLowerCase("pt-PT");
    return options.filter((option) => {
      if (selected.has(option.id)) return false;
      return !query || option.label.toLocaleLowerCase("pt-PT").includes(query);
    });
  }, [inputValue, options, selectedIds]);

  function setAutocompleteValidity() {
    inputRef.current?.setCustomValidity(
      required && selectedIds.length === 0 ? "Escolhe pelo menos uma opcao." : "",
    );
  }

  function addOption(option: CatalogOption) {
    setSelectedIds((current) => (current.includes(option.id) ? current : [...current, option.id]));
    setInputValue("");
    setIsOpen(false);
    window.setTimeout(setAutocompleteValidity, 0);
  }

  function removeOption(optionId: string) {
    setSelectedIds((current) => current.filter((id) => id !== optionId));
    window.setTimeout(setAutocompleteValidity, 0);
  }

  return (
    <div className={`relative block ${isOpen ? "z-[100]" : ""}`}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={`mt-2 rounded-md border border-[#d7ded3] bg-white px-2 ring-[#16735f]/20 transition focus-within:border-[#16735f] focus-within:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground ${
          selectedOptions.length > 0 ? "min-h-10 py-2" : "flex h-10 items-center"
        }`}
      >
        {selectedOptions.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedOptions.map((option) => (
              <span
                key={option.id}
                className="inline-flex items-center gap-2 rounded bg-[#eef2eb] px-2 py-1 text-xs font-semibold text-[#18201b] dark:bg-secondary dark:text-foreground"
              >
                {option.label}
                <button
                  type="button"
                  onClick={() => removeOption(option.id)}
                  className="text-[#52605a] hover:text-[#b43b2f] dark:text-muted-foreground dark:hover:text-destructive"
                  aria-label={`Remover ${option.label}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder="Comeca a escrever..."
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
            setAutocompleteValidity();
          }}
          onChange={(event) => {
            setInputValue(event.currentTarget.value);
            setHighlightedIndex(0);
            setIsOpen(true);
            setAutocompleteValidity();
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
                addOption(option);
              }
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          onBlur={() => {
            setAutocompleteValidity();
            window.setTimeout(() => setIsOpen(false), 100);
          }}
          className="h-8 w-full border-0 bg-transparent px-1 outline-none"
          required={required && selectedIds.length === 0}
        />
      </div>
      {selectedIds.map((id) => (
        <input key={id} name={name} type="hidden" value={id} readOnly />
      ))}
      {isOpen ? (
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
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => addOption(option)}
                className={`block w-full px-3 py-2 text-left focus:outline-none ${
                  highlightedIndex === index ? "bg-[#eef2eb] dark:bg-accent" : "hover:bg-[#eef2eb] dark:hover:bg-accent"
                }`}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-[#52605a] dark:text-muted-foreground">Sem resultados</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TeamSelect({
  name,
  label,
  teams,
  defaultValue = "",
  required,
  compact,
}: {
  name: string;
  label: string;
  teams: TeamRow[];
  defaultValue?: string;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className={`mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground ${
          compact ? "text-sm" : ""
        }`}
      >
        <option value="" disabled={required}>
          Escolher equipa
        </option>
        {teams.map((team) => (
          <option key={team._id} value={team._id}>
            {team.code ? `${team.name} (${team.code})` : team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GroupSelect({
  name,
  label,
  defaultValue = "",
  compact,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 disabled:bg-[#eef2eb] disabled:text-[#8a958f] dark:border-border dark:bg-input/30 dark:text-foreground dark:disabled:bg-secondary dark:disabled:text-muted-foreground ${
          compact ? "text-sm" : ""
        }`}
      >
        <option value="">Sem grupo</option>
        {groups.map((group) => (
          <option key={group} value={group}>
            Grupo {group}
          </option>
        ))}
      </select>
    </label>
  );
}

function StageSelect({
  name,
  label,
  defaultValue = "group",
  compact,
  onChange,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  compact?: boolean;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}) {
  return (
    <label className="block">
      <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={onChange}
        className={`mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground ${
          compact ? "text-sm" : ""
        }`}
      >
        {stages.map(([value, labelText]) => (
          <option key={value} value={value}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function MatchStageGroupFields({
  defaultStage = "group",
  defaultGroup = "",
  compact,
}: {
  defaultStage?: MatchRow["stage"];
  defaultGroup?: string;
  compact?: boolean;
}) {
  const [stage, setStage] = useState<MatchRow["stage"]>(defaultStage);
  const isGroupStage = stage === "group";

  return (
    <>
      <StageSelect
        name="stage"
        label="Fase"
        defaultValue={defaultStage}
        compact={compact}
        onChange={(event) => setStage(event.currentTarget.value as MatchRow["stage"])}
      />
      <GroupSelect
        name="group"
        label="Grupo"
        defaultValue={defaultGroup}
        compact={compact}
        disabled={!isGroupStage}
      />
    </>
  );
}

function StatusSelect({
  name,
  label,
  defaultValue = "scheduled",
  compact,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className={`mt-2 h-10 w-full rounded-md border border-[#d7ded3] bg-white px-3 outline-none ring-[#16735f]/20 transition focus:border-[#16735f] focus:ring-4 dark:border-border dark:bg-input/30 dark:text-foreground ${
          compact ? "text-sm" : ""
        }`}
      >
        {statuses.map(([value, labelText]) => (
          <option key={value} value={value}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function IconSubmit({
  pending,
  label,
  icon = "plus",
  disabled,
}: {
  pending: boolean;
  label: string;
  icon?: "plus" | "edit";
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="mt-6 flex h-10 items-center justify-center gap-2 rounded-md bg-[#16735f] px-3 text-sm font-semibold text-white transition hover:bg-[#0f5d4d] disabled:opacity-60"
      aria-label={label}
    >
      {pending ? <Loader2 className="animate-spin" size={16} /> : icon === "plus" ? <Plus size={16} /> : <Pencil size={16} />}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-[#cbd5c7] bg-[#fbfcfa] p-4 text-sm text-[#52605a] transition-colors dark:border-border dark:bg-secondary dark:text-muted-foreground">
      {text}
    </p>
  );
}
