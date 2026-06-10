import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { groupValidator, matchStatusValidator, stageValidator } from "./schema";

const specialLabels = {
  worldCupWinnerTeamId: "Vencedor do Mundial",
  mvpPlayerId: "MVP",
  youngMvpPlayerId: "MVP jovem",
  topScorerPlayerId: "Melhor marcador",
  topAssisterPlayerId: "Melhor assistente",
  mostGoalsTeamId: "Equipa com mais golos",
  fewestConcededTeamId: "Equipa com menos golos sofridos",
  ownGoals: "Numero de auto-golos",
  redCards: "Numero de cartoes vermelhos",
} as const;

const specialPoints = {
  worldCupWinnerTeamId: 30,
  mvpPlayerId: 30,
  youngMvpPlayerId: 30,
  topScorerPlayerId: 20,
  topAssisterPlayerId: 20,
  mostGoalsTeamId: 15,
  fewestConcededTeamId: 15,
  ownGoals: 50,
  redCards: 50,
} as const;

const multiAnswerSpecialKeys = [
  "topScorerPlayerId",
  "topAssisterPlayerId",
  "mostGoalsTeamId",
  "fewestConcededTeamId",
] as const;

type MultiAnswerSpecialKey = (typeof multiAnswerSpecialKeys)[number];
type SpecialKey = keyof typeof specialPoints;

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

function winner(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function scoreMatchBet(match: Doc<"matches">, bet?: Doc<"matchBets">) {
  if (
    !bet ||
    match.status !== "finished" ||
    match.homeScore === undefined ||
    match.awayScore === undefined
  ) {
    return 0;
  }

  if (bet.homeScore === match.homeScore && bet.awayScore === match.awayScore) {
    return 5;
  }

  return winner(bet.homeScore, bet.awayScore) ===
    winner(match.homeScore, match.awayScore)
    ? 3
    : 0;
}

function isExactMatchBet(match: Doc<"matches">, bet?: Doc<"matchBets">) {
  return (
    !!bet &&
    match.status === "finished" &&
    match.homeScore !== undefined &&
    match.awayScore !== undefined &&
    bet.homeScore === match.homeScore &&
    bet.awayScore === match.awayScore
  );
}

function displayMatchStatus(match: Doc<"matches">) {
  if (match.status === "finished") return "finished";
  return match.kickoffAt <= Date.now() ? "live" : "scheduled";
}

function scoreSpecialBet(
  bet: Doc<"specialBets"> | null,
  result: Doc<"specialResults"> | null,
) {
  if (!bet || !result) return 0;

  let total = 0;
  const idKeys = [
    "worldCupWinnerTeamId",
    "mvpPlayerId",
    "youngMvpPlayerId",
    "topScorerPlayerId",
    "topAssisterPlayerId",
    "mostGoalsTeamId",
    "fewestConcededTeamId",
  ] as const;

  for (const key of idKeys) {
    if (isCorrectSpecialAnswer(bet, result, key)) total += specialPoints[key];
  }
  if (bet.ownGoals === result.ownGoals) total += specialPoints.ownGoals;
  if (bet.redCards === result.redCards) total += specialPoints.redCards;

  return total;
}

function scoreSpecialField(
  bet: Doc<"specialBets">,
  result: Doc<"specialResults">,
  key: SpecialKey,
) {
  return isCorrectSpecialAnswer(bet, result, key) ? specialPoints[key] : 0;
}

function isMultiAnswerSpecialKey(key: SpecialKey): key is MultiAnswerSpecialKey {
  return (multiAnswerSpecialKeys as readonly string[]).includes(key);
}

function specialResultValues(result: Doc<"specialResults">, key: SpecialKey) {
  const value = result[key];
  return Array.isArray(value) ? value : [value];
}

function isCorrectSpecialAnswer(
  bet: Doc<"specialBets">,
  result: Doc<"specialResults">,
  key: SpecialKey,
) {
  if (key === "ownGoals" || key === "redCards") return bet[key] === result[key];
  if (isMultiAnswerSpecialKey(key)) return specialResultValues(result, key).includes(bet[key]);
  return bet[key] === result[key];
}

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Precisas de iniciar sessao.");

  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilizador nao encontrado.");

  return { userId, user };
}

async function requireAdmin(ctx: MutationCtx) {
  const { user } = await requireUser(ctx);
  if (!user.isAdmin) throw new Error("Apenas administradores podem fazer isto.");
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser um numero inteiro positivo.`);
  }
}

function validateMatchPayload(args: {
  homeTeamId: Id<"teams">;
  awayTeamId: Id<"teams">;
  kickoffAt: number;
  stage: Doc<"matches">["stage"];
  group?: Doc<"matches">["group"];
  status: Doc<"matches">["status"];
  homeScore?: number;
  awayScore?: number;
}) {
  if (args.homeTeamId === args.awayTeamId) {
    throw new Error("As equipas do jogo devem ser diferentes.");
  }
  if (!Number.isFinite(args.kickoffAt)) {
    throw new Error("A data do jogo e invalida.");
  }
  if (args.stage === "group" && !args.group) {
    throw new Error("Jogos da fase de grupos precisam de grupo.");
  }
  if (args.stage !== "group" && args.group !== undefined) {
    throw new Error("So jogos da fase de grupos devem ter grupo.");
  }
  if (args.status === "finished") {
    if (args.homeScore === undefined || args.awayScore === undefined) {
      throw new Error("Jogos terminados precisam de resultado final.");
    }
    assertNonNegativeInteger(args.homeScore, "Resultado da casa");
    assertNonNegativeInteger(args.awayScore, "Resultado de fora");
    return;
  }
  if (args.homeScore !== undefined) assertNonNegativeInteger(args.homeScore, "Resultado da casa");
  if (args.awayScore !== undefined) assertNonNegativeInteger(args.awayScore, "Resultado de fora");
}

async function requireTeam(ctx: QueryCtx | MutationCtx, teamId: Id<"teams">) {
  const team = await ctx.db.get(teamId);
  if (!team) throw new Error("Equipa nao encontrada.");
  return team;
}

async function requirePlayer(ctx: QueryCtx | MutationCtx, playerId: Id<"players">) {
  const player = await ctx.db.get(playerId);
  if (!player) throw new Error("Jogador nao encontrado.");
  return player;
}

async function requireYoungPlayer(ctx: QueryCtx | MutationCtx, playerId: Id<"players">) {
  const player = await requirePlayer(ctx, playerId);
  if (!player.isYoung) throw new Error("O MVP jovem tem de ser um jogador jovem.");
  return player;
}

async function hydrateMatch(ctx: QueryCtx, match: Doc<"matches">) {
  const [homeTeam, awayTeam] = await Promise.all([
    ctx.db.get(match.homeTeamId),
    ctx.db.get(match.awayTeamId),
  ]);
  return {
    ...match,
    displayStatus: displayMatchStatus(match),
    homeTeam: homeTeam?.name ?? "Equipa removida",
    awayTeam: awayTeam?.name ?? "Equipa removida",
    homeTeamCode: homeTeam?.code,
    awayTeamCode: awayTeam?.code,
  };
}

export const specialConfig = query({
  args: {},
  handler: () => ({
    labels: specialLabels,
    points: specialPoints,
    stages: stageLabels,
    statuses: statusLabels,
  }),
});

export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = username.trim();
    if (normalized.length < 3) return false;
    const existing = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", normalized))
      .first();
    return existing === null;
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    return {
      _id: user._id,
      username: user.username ?? user.name ?? user.email ?? "Utilizador",
      email: user.email,
      isAdmin: user.isAdmin ?? false,
    };
  },
});

export const teams = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("teams").withIndex("name").collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const players = query({
  args: {},
  handler: async (ctx) => {
    const [playersRows, teamsRows] = await Promise.all([
      ctx.db.query("players").withIndex("name").collect(),
      ctx.db.query("teams").collect(),
    ]);
    const teamsById = new Map(teamsRows.map((team) => [team._id, team]));
    return playersRows
      .map((player) => ({
        ...player,
        isYoung: player.isYoung ?? false,
        teamName: teamsById.get(player.teamId)?.name ?? "Equipa removida",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const catalogOptions = query({
  args: {},
  handler: async (ctx) => {
    const [teamsRows, playersRows] = await Promise.all([
      ctx.db.query("teams").collect(),
      ctx.db.query("players").collect(),
    ]);
    const teamsById = new Map(teamsRows.map((team) => [team._id, team]));
    return {
      teams: teamsRows
        .map((team) => ({
          id: team._id,
          label: team.code ? `${team.name} (${team.code})` : team.name,
          group: team.group,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      players: playersRows
        .map((player) => {
          const team = teamsById.get(player.teamId);
          return {
            id: player._id,
            label: team ? `${player.name} - ${team.name}` : player.name,
            teamId: player.teamId,
            isYoung: player.isYoung ?? false,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
      youngPlayers: playersRows
        .filter((player) => player.isYoung)
        .map((player) => {
          const team = teamsById.get(player.teamId);
          return {
            id: player._id,
            label: team ? `${player.name} - ${team.name}` : player.name,
            teamId: player.teamId,
            isYoung: true,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const matches = await ctx.db.query("matches").withIndex("kickoffAt").collect();
    const bets = await ctx.db
      .query("matchBets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const specialBet = await ctx.db
      .query("specialBets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const specialResult = await ctx.db.query("specialResults").first();

    const betsByMatch = new Map(bets.map((bet) => [bet.matchId, bet]));
    const matchRows = await Promise.all(
      matches.map(async (match) => {
        const hydrated = await hydrateMatch(ctx, match);
        const bet = betsByMatch.get(match._id);
        return {
          ...hydrated,
          bet: bet
            ? {
                homeScore: bet.homeScore,
                awayScore: bet.awayScore,
                points: scoreMatchBet(match, bet),
              }
            : null,
        };
      }),
    );

    return {
      matches: matchRows,
      specialBet,
      specialResult,
      specialPoints: specialResult ? scoreSpecialBet(specialBet, specialResult) : 0,
    };
  },
});

export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const [users, matches, allBets, allSpecialBets, specialResult] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("matches").collect(),
      ctx.db.query("matchBets").collect(),
      ctx.db.query("specialBets").collect(),
      ctx.db.query("specialResults").first(),
    ]);

    const matchesById = new Map(matches.map((match) => [match._id, match]));
    const matchPointsByUser = new Map<Id<"users">, number>();
    const exactMatchesByUser = new Map<Id<"users">, number>();
    for (const bet of allBets) {
      const match = matchesById.get(bet.matchId);
      if (!match) continue;
      matchPointsByUser.set(
        bet.userId,
        (matchPointsByUser.get(bet.userId) ?? 0) + scoreMatchBet(match, bet),
      );
      if (isExactMatchBet(match, bet)) {
        exactMatchesByUser.set(bet.userId, (exactMatchesByUser.get(bet.userId) ?? 0) + 1);
      }
    }

    const specialByUser = new Map(allSpecialBets.map((bet) => [bet.userId, bet]));
    return users
      .filter((user) => !user.isAnonymous)
      .map((user) => {
        const matchPoints = matchPointsByUser.get(user._id) ?? 0;
        const specialPointsTotal = scoreSpecialBet(
          specialByUser.get(user._id) ?? null,
          specialResult,
        );
        return {
          userId: user._id,
          username: user.username ?? user.name ?? user.email ?? "Utilizador",
          matchPoints,
          specialPoints: specialPointsTotal,
          exactMatches: exactMatchesByUser.get(user._id) ?? 0,
          totalPoints: matchPoints + specialPointsTotal,
        };
      })
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints ||
          b.exactMatches - a.exactMatches ||
          a.username.localeCompare(b.username),
      );
  },
});

export const playerProfile = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await requireUser(ctx);

    const normalizedUserId = ctx.db.normalizeId("users", userId);
    if (!normalizedUserId) return null;

    const profileUser = await ctx.db.get(normalizedUserId);
    if (!profileUser || profileUser.isAnonymous) return null;

    const [matches, bets, specialBet, specialResult, teamsRows, playersRows] =
      await Promise.all([
        ctx.db.query("matches").withIndex("kickoffAt").collect(),
        ctx.db
          .query("matchBets")
          .withIndex("by_user", (q) => q.eq("userId", normalizedUserId))
          .collect(),
        ctx.db
          .query("specialBets")
          .withIndex("by_user", (q) => q.eq("userId", normalizedUserId))
          .first(),
        ctx.db.query("specialResults").first(),
        ctx.db.query("teams").collect(),
        ctx.db.query("players").collect(),
      ]);

    const teamsById = new Map(teamsRows.map((team) => [team._id, team]));
    const playersById = new Map(playersRows.map((player) => [player._id, player]));
    const betsByMatch = new Map(bets.map((bet) => [bet.matchId, bet]));
    const now = Date.now();

    const visibleMatches = await Promise.all(
      matches
        .filter((match) => match.status === "finished" || match.kickoffAt <= now)
        .map(async (match) => {
          const hydrated = await hydrateMatch(ctx, match);
          const bet = betsByMatch.get(match._id);
          const points = scoreMatchBet(match, bet);
          return {
            ...hydrated,
            bet: bet
              ? {
                  homeScore: bet.homeScore,
                  awayScore: bet.awayScore,
                  points,
                  exact: isExactMatchBet(match, bet),
                }
              : null,
          };
        }),
    );

    const matchPoints = visibleMatches.reduce(
      (total, match) => total + (match.bet?.points ?? 0),
      0,
    );
    const exactMatches = visibleMatches.filter((match) => match.bet?.exact).length;
    const specialPointsTotal = scoreSpecialBet(specialBet, specialResult);

    function teamLabel(teamId: Id<"teams">) {
      const team = teamsById.get(teamId);
      return team?.code ? `${team.name} (${team.code})` : team?.name ?? "Resposta removida";
    }

    function playerLabel(playerId: Id<"players">) {
      const player = playersById.get(playerId);
      const team = player ? teamsById.get(player.teamId) : null;
      return player
        ? team
          ? `${player.name} - ${team.name}`
          : player.name
        : "Resposta removida";
    }

    const specialBreakdown =
      specialBet && specialResult
        ? (Object.keys(specialPoints) as Array<keyof typeof specialPoints>).map((key) => {
            const betValue = specialBet[key];
            const resultValue = specialResult[key];
            const isTeam = key.endsWith("TeamId");
            const isPlayer = key.endsWith("PlayerId");
            const formatValue = (value: typeof betValue | typeof resultValue): string => {
              if (Array.isArray(value)) {
                return value.map((item) => formatValue(item)).join(" ou ");
              }
              if (typeof value === "number") return String(value);
              if (isTeam) return teamLabel(value as Id<"teams">);
              if (isPlayer) return playerLabel(value as Id<"players">);
              return String(value);
            };

            return {
              key,
              label: specialLabels[key],
              bet: formatValue(betValue),
              result: formatValue(resultValue),
              points: scoreSpecialField(specialBet, specialResult, key),
              maxPoints: specialPoints[key],
              correct: isCorrectSpecialAnswer(specialBet, specialResult, key),
            };
          })
        : [];

    return {
      user: {
        _id: profileUser._id,
        username: profileUser.username ?? profileUser.name ?? profileUser.email ?? "Utilizador",
      },
      totals: {
        matchPoints,
        specialPoints: specialPointsTotal,
        exactMatches,
        totalPoints: matchPoints + specialPointsTotal,
      },
      matches: visibleMatches.sort(
        (a, b) =>
          b.kickoffAt - a.kickoffAt ||
          a.homeTeam.localeCompare(b.homeTeam) ||
          a.awayTeam.localeCompare(b.awayTeam),
      ),
      specialBreakdown,
      specialsAreResolved: specialResult !== null,
      hiddenMatchCount: matches.filter(
        (match) => match.status !== "finished" && match.kickoffAt > now,
      ).length,
    };
  },
});

export const adminData = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    if (!user.isAdmin) return null;

    const [matches, teamsRows, playersRows, specialResult] = await Promise.all([
      ctx.db.query("matches").withIndex("kickoffAt").collect(),
      ctx.db.query("teams").withIndex("name").collect(),
      ctx.db.query("players").withIndex("name").collect(),
      ctx.db.query("specialResults").first(),
    ]);
    const hydratedMatches = await Promise.all(matches.map((match) => hydrateMatch(ctx, match)));
    const teamsById = new Map(teamsRows.map((team) => [team._id, team]));

    return {
      matches: hydratedMatches,
      teams: teamsRows,
      players: playersRows.map((player) => ({
        ...player,
        isYoung: player.isYoung ?? false,
        teamName: teamsById.get(player.teamId)?.name ?? "Equipa removida",
      })),
      specialResult,
    };
  },
});

export const saveMatchBet = mutation({
  args: {
    matchId: v.id("matches"),
    homeScore: v.number(),
    awayScore: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Jogo nao encontrado.");
    if (match.status !== "scheduled" || match.kickoffAt <= Date.now()) {
      throw new Error("So podes apostar em jogos agendados.");
    }
    assertNonNegativeInteger(args.homeScore, "Resultado da casa");
    assertNonNegativeInteger(args.awayScore, "Resultado de fora");

    const existing = await ctx.db
      .query("matchBets")
      .withIndex("by_user_match", (q) =>
        q.eq("userId", userId).eq("matchId", args.matchId),
      )
      .first();

    const patch = {
      homeScore: args.homeScore,
      awayScore: args.awayScore,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("matchBets", {
      userId,
      matchId: args.matchId,
      ...patch,
    });
  },
});

const specialArgs = {
  worldCupWinnerTeamId: v.id("teams"),
  mvpPlayerId: v.id("players"),
  youngMvpPlayerId: v.id("players"),
  topScorerPlayerId: v.id("players"),
  topAssisterPlayerId: v.id("players"),
  mostGoalsTeamId: v.id("teams"),
  fewestConcededTeamId: v.id("teams"),
  ownGoals: v.number(),
  redCards: v.number(),
};

const specialResultArgs = {
  ...specialArgs,
  topScorerPlayerId: v.array(v.id("players")),
  topAssisterPlayerId: v.array(v.id("players")),
  mostGoalsTeamId: v.array(v.id("teams")),
  fewestConcededTeamId: v.array(v.id("teams")),
};

async function validateSpecialRefs(ctx: QueryCtx | MutationCtx, args: {
  worldCupWinnerTeamId: Id<"teams">;
  mvpPlayerId: Id<"players">;
  youngMvpPlayerId: Id<"players">;
  topScorerPlayerId: Id<"players">;
  topAssisterPlayerId: Id<"players">;
  mostGoalsTeamId: Id<"teams">;
  fewestConcededTeamId: Id<"teams">;
  ownGoals: number;
  redCards: number;
}) {
  await Promise.all([
    requireTeam(ctx, args.worldCupWinnerTeamId),
    requireTeam(ctx, args.mostGoalsTeamId),
    requireTeam(ctx, args.fewestConcededTeamId),
    requirePlayer(ctx, args.mvpPlayerId),
    requireYoungPlayer(ctx, args.youngMvpPlayerId),
    requirePlayer(ctx, args.topScorerPlayerId),
    requirePlayer(ctx, args.topAssisterPlayerId),
  ]);
  assertNonNegativeInteger(args.ownGoals, "Auto-golos");
  assertNonNegativeInteger(args.redCards, "Cartoes vermelhos");
}

async function validateSpecialResultRefs(ctx: QueryCtx | MutationCtx, args: {
  worldCupWinnerTeamId: Id<"teams">;
  mvpPlayerId: Id<"players">;
  youngMvpPlayerId: Id<"players">;
  topScorerPlayerId: Array<Id<"players">>;
  topAssisterPlayerId: Array<Id<"players">>;
  mostGoalsTeamId: Array<Id<"teams">>;
  fewestConcededTeamId: Array<Id<"teams">>;
  ownGoals: number;
  redCards: number;
}) {
  const assertAnswers = (values: unknown[], label: string) => {
    if (values.length === 0) throw new Error(`${label} precisa de pelo menos uma resposta.`);
    if (new Set(values).size !== values.length) {
      throw new Error(`${label} tem respostas repetidas.`);
    }
  };

  assertAnswers(args.topScorerPlayerId, specialLabels.topScorerPlayerId);
  assertAnswers(args.topAssisterPlayerId, specialLabels.topAssisterPlayerId);
  assertAnswers(args.mostGoalsTeamId, specialLabels.mostGoalsTeamId);
  assertAnswers(args.fewestConcededTeamId, specialLabels.fewestConcededTeamId);

  await Promise.all([
    requireTeam(ctx, args.worldCupWinnerTeamId),
    ...args.mostGoalsTeamId.map((teamId) => requireTeam(ctx, teamId)),
    ...args.fewestConcededTeamId.map((teamId) => requireTeam(ctx, teamId)),
    requirePlayer(ctx, args.mvpPlayerId),
    requireYoungPlayer(ctx, args.youngMvpPlayerId),
    ...args.topScorerPlayerId.map((playerId) => requirePlayer(ctx, playerId)),
    ...args.topAssisterPlayerId.map((playerId) => requirePlayer(ctx, playerId)),
  ]);
  assertNonNegativeInteger(args.ownGoals, "Auto-golos");
  assertNonNegativeInteger(args.redCards, "Cartoes vermelhos");
}

export const saveSpecialBet = mutation({
  args: specialArgs,
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const firstMatch = await ctx.db.query("matches").withIndex("kickoffAt").first();
    if (firstMatch && firstMatch.kickoffAt <= Date.now()) {
      throw new Error("As apostas especiais fecharam no inicio do primeiro jogo.");
    }

    await validateSpecialRefs(ctx, args);

    const existing = await ctx.db
      .query("specialBets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const payload = { ...args, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("specialBets", { userId, ...payload });
  },
});

export const createTeam = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    group: v.optional(groupValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = cleanText(args.name);
    const code = args.code ? cleanText(args.code).toUpperCase() : undefined;
    if (name.length < 2) throw new Error("O nome da equipa e obrigatorio.");

    return await ctx.db.insert("teams", {
      name,
      code: code || undefined,
      group: args.group,
    });
  },
});

export const updateTeam = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    code: v.optional(v.string()),
    group: v.optional(groupValidator),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireTeam(ctx, args.teamId);
    const name = cleanText(args.name);
    const code = args.code ? cleanText(args.code).toUpperCase() : undefined;
    if (name.length < 2) throw new Error("O nome da equipa e obrigatorio.");
    await ctx.db.patch(args.teamId, {
      name,
      code: code || undefined,
      group: args.group,
    });
  },
});

export const createPlayer = mutation({
  args: {
    name: v.string(),
    teamId: v.id("teams"),
    isYoung: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireTeam(ctx, args.teamId);
    const name = cleanText(args.name);
    if (name.length < 2) throw new Error("O nome do jogador e obrigatorio.");
    return await ctx.db.insert("players", {
      name,
      teamId: args.teamId,
      isYoung: args.isYoung,
    });
  },
});

export const updatePlayer = mutation({
  args: {
    playerId: v.id("players"),
    name: v.string(),
    teamId: v.id("teams"),
    isYoung: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requirePlayer(ctx, args.playerId);
    await requireTeam(ctx, args.teamId);
    const name = cleanText(args.name);
    if (name.length < 2) throw new Error("O nome do jogador e obrigatorio.");
    await ctx.db.patch(args.playerId, {
      name,
      teamId: args.teamId,
      isYoung: args.isYoung,
    });
  },
});

export const importSquadCatalog = mutation({
  args: {
    teams: v.array(
      v.object({
        name: v.string(),
        code: v.string(),
        group: v.optional(v.union(groupValidator, v.null())),
      }),
    ),
    players: v.array(
      v.object({
        name: v.string(),
        teamCode: v.string(),
        isYoung: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existingTeams = await ctx.db.query("teams").collect();
    const teamsByCode = new Map(
      existingTeams
        .filter((team) => team.code)
        .map((team) => [team.code!.toUpperCase(), team]),
    );
    const teamsByName = new Map(existingTeams.map((team) => [team.name, team]));
    const teamIdsByCode = new Map<string, Id<"teams">>();
    let teamsInserted = 0;
    let teamsUpdated = 0;

    for (const teamPayload of args.teams) {
      const name = cleanText(teamPayload.name);
      const code = cleanText(teamPayload.code).toUpperCase();
      if (name.length < 2) throw new Error("O nome da equipa e obrigatorio.");
      if (code.length < 2) throw new Error(`Codigo invalido para ${name}.`);

      const existing = teamsByCode.get(code) ?? teamsByName.get(name);
      const patch = {
        name,
        code,
        ...(teamPayload.group ? { group: teamPayload.group } : {}),
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        teamIdsByCode.set(code, existing._id);
        teamsUpdated += 1;
      } else {
        const teamId = await ctx.db.insert("teams", {
          name,
          code,
          group: teamPayload.group || undefined,
        });
        teamIdsByCode.set(code, teamId);
        teamsInserted += 1;
      }
    }

    const teamsAfterImport = await ctx.db.query("teams").collect();
    for (const team of teamsAfterImport) {
      if (team.code) teamIdsByCode.set(team.code.toUpperCase(), team._id);
    }

    const existingPlayers = await ctx.db.query("players").collect();
    const playersByTeamAndName = new Map<string, Doc<"players">>();
    for (const player of existingPlayers) {
      const playerKey = `${player.teamId}:${player.name}:${player.isYoung ?? false}`;
      if (playersByTeamAndName.has(playerKey)) {
        await ctx.db.delete(player._id);
      } else {
        playersByTeamAndName.set(playerKey, player);
      }
    }
    let playersInserted = 0;
    let playersUpdated = 0;

    for (const playerPayload of args.players) {
      const name = cleanText(playerPayload.name);
      const teamCode = cleanText(playerPayload.teamCode).toUpperCase();
      const teamId = teamIdsByCode.get(teamCode);
      if (!teamId) throw new Error(`Equipa nao encontrada para o codigo ${teamCode}.`);
      if (name.length < 1) throw new Error(`Jogador sem nome em ${teamCode}.`);

      const playerKey = `${teamId}:${name}:${playerPayload.isYoung}`;
      const existing = playersByTeamAndName.get(playerKey);
      if (existing) {
        await ctx.db.patch(existing._id, {
          name,
          teamId,
          isYoung: playerPayload.isYoung,
        });
        playersByTeamAndName.set(playerKey, existing);
        playersUpdated += 1;
      } else {
        const playerId = await ctx.db.insert("players", {
          name,
          teamId,
          isYoung: playerPayload.isYoung,
        });
        playersByTeamAndName.set(playerKey, {
          _id: playerId,
          _creationTime: Date.now(),
          name,
          teamId,
          isYoung: playerPayload.isYoung,
        });
        playersInserted += 1;
      }
    }

    return {
      teamsInserted,
      teamsUpdated,
      playersInserted,
      playersUpdated,
    };
  },
});

export const createMatch = mutation({
  args: {
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
    kickoffAt: v.number(),
    stage: stageValidator,
    group: v.optional(groupValidator),
    status: matchStatusValidator,
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await Promise.all([requireTeam(ctx, args.homeTeamId), requireTeam(ctx, args.awayTeamId)]);
    validateMatchPayload(args);
    return await ctx.db.insert("matches", args);
  },
});

export const updateMatch = mutation({
  args: {
    matchId: v.id("matches"),
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
    kickoffAt: v.number(),
    stage: stageValidator,
    group: v.optional(groupValidator),
    status: matchStatusValidator,
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Jogo nao encontrado.");
    await Promise.all([requireTeam(ctx, args.homeTeamId), requireTeam(ctx, args.awayTeamId)]);
    validateMatchPayload(args);
    const { matchId, ...payload } = args;
    await ctx.db.patch(matchId, payload);
  },
});

export const setMatchStatusAndResult = mutation({
  args: {
    matchId: v.id("matches"),
    status: matchStatusValidator,
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Jogo nao encontrado.");
    validateMatchPayload({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoffAt: match.kickoffAt,
      stage: match.stage,
      group: match.group,
      status: args.status,
      homeScore: args.homeScore,
      awayScore: args.awayScore,
    });
    await ctx.db.patch(args.matchId, {
      status: args.status,
      homeScore: args.homeScore,
      awayScore: args.awayScore,
    });
  },
});

export const setSpecialResults = mutation({
  args: specialResultArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await validateSpecialResultRefs(ctx, args);
    const existing = await ctx.db.query("specialResults").first();
    const payload = { ...args, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("specialResults", payload);
  },
});
