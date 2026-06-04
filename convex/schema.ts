import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const groupValidator = v.union(
  v.literal("A"),
  v.literal("B"),
  v.literal("C"),
  v.literal("D"),
  v.literal("E"),
  v.literal("F"),
  v.literal("G"),
  v.literal("H"),
  v.literal("I"),
  v.literal("J"),
  v.literal("K"),
  v.literal("L"),
);

export const stageValidator = v.union(
  v.literal("group"),
  v.literal("roundOf32"),
  v.literal("roundOf16"),
  v.literal("quarterFinal"),
  v.literal("semiFinal"),
  v.literal("thirdPlace"),
  v.literal("final"),
);

export const matchStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("finished"),
);

const specialFields = {
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

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("username", ["username"]),
  teams: defineTable({
    name: v.string(),
    code: v.optional(v.string()),
    group: v.optional(groupValidator),
  })
    .index("name", ["name"])
    .index("group", ["group"]),
  players: defineTable({
    name: v.string(),
    teamId: v.id("teams"),
    isYoung: v.optional(v.boolean()),
  })
    .index("name", ["name"])
    .index("teamId", ["teamId"]),
  matches: defineTable({
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
    kickoffAt: v.number(),
    stage: stageValidator,
    group: v.optional(groupValidator),
    status: matchStatusValidator,
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
  })
    .index("kickoffAt", ["kickoffAt"])
    .index("stage", ["stage"])
    .index("group", ["group"]),
  matchBets: defineTable({
    userId: v.id("users"),
    matchId: v.id("matches"),
    homeScore: v.number(),
    awayScore: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_match", ["matchId"])
    .index("by_user_match", ["userId", "matchId"]),
  specialBets: defineTable({
    userId: v.id("users"),
    ...specialFields,
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  specialResults: defineTable({
    ...specialFields,
    updatedAt: v.number(),
  }),
});
