"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type LeaderboardRow = {
  userId: string;
  username: string;
  matchPoints: number;
  specialPoints: number;
  exactMatches: number;
  totalPoints: number;
};

const previewRows: LeaderboardRow[] = [
  { userId: "preview-1", username: "Tom", matchPoints: 62, specialPoints: 20, exactMatches: 8, totalPoints: 82 },
  { userId: "preview-2", username: "Kev", matchPoints: 59, specialPoints: 15, exactMatches: 6, totalPoints: 74 },
  { userId: "preview-3", username: "Moose", matchPoints: 52, specialPoints: 15, exactMatches: 5, totalPoints: 67 },
  { userId: "preview-4", username: "Jade", matchPoints: 49, specialPoints: 10, exactMatches: 4, totalPoints: 59 },
];

export function LandingLeaderboard() {
  const leaderboard = useQuery(api.betting.leaderboard) as LeaderboardRow[] | undefined;
  const rows = leaderboard?.slice(0, 4) ?? previewRows;

  return (
    <section className="rounded-lg border border-[#f4eadc]/20 bg-black/25 p-3 text-[#f5efe2] backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.16em]">
            Leaderboard
          </h2>
          <p className="mt-1 text-xs text-[#f5efe2]/65">
            Jogos, especiais e resultados exatos
          </p>
        </div>
        <span className="rounded-md bg-[#f4eadc]/10 px-2.5 py-1 font-mono text-xs font-bold">
          {leaderboard === undefined ? "Preview" : `${leaderboard.length} players`}
        </span>
      </div>

      <div className="space-y-2">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <div
              key={row.userId}
              className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-md border border-[#f4eadc]/15 bg-[#0b0d0a]/55 px-3 py-2.5"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-md font-mono text-sm font-bold ${
                  index === 0
                    ? "bg-[#f4c430] text-[#30240a]"
                    : "bg-[#f4eadc]/10 text-[#f4eadc]"
                }`}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold">{row.username}</span>
                <span className="block text-xs text-[#f5efe2]/65">
                  Jogos {row.matchPoints} · Especiais {row.specialPoints} · Exatos{" "}
                  {row.exactMatches}
                </span>
              </span>
              <span className="rounded-md bg-white/10 px-3 py-2 font-mono text-sm font-bold">
                {row.totalPoints} pts
              </span>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed border-[#f4eadc]/20 bg-[#0b0d0a]/45 p-4 text-sm text-[#f5efe2]/75">
            A tua liga aparece aqui quando houver jogadores.
          </p>
        )}
      </div>
    </section>
  );
}
