import type { StatSummary } from "../stats/progress";
import { challengeStatuses, challengesXp, todayKey, type ChallengeStatus } from "./challenges";
import type { Journal } from "./journal";
import { levelFor, levelTitle, statsXp, xpForLevel } from "./levels";
import type { Milestone, MilestoneStatus } from "./milestones";
import { shiftDay } from "./time";

export interface GameState {
  stats: StatSummary[];
  xp: number;
  level: number;
  levelTitle: string;
  /** XP earned within the current level, and needed to reach the next. */
  levelProgress: number;
  levelSpan: number;
  milestones: { milestone: Milestone; status: MilestoneStatus }[];
  challenges: ChallengeStatus[];
  /** Consecutive days with an unlock, ending today (or yesterday, if today has none yet). */
  streak: number;
  playedToday: boolean;
}

function currentStreak(journal: Journal, today: string): number {
  let day = journal.byDay.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (journal.byDay.has(day)) {
    streak++;
    day = shiftDay(day, -1);
  }
  return streak;
}

/** Everything derived from the journal; recomputed after every unlock. */
export function computeGameState(journal: Journal, stats: StatSummary[], milestones: Milestone[]): GameState {
  const today = todayKey();
  const ms = milestones.map((milestone) => ({ milestone, status: milestone.evaluate(journal) }));
  const xp =
    statsXp(stats) + ms.reduce((sum, m) => sum + (m.status.done ? m.milestone.xp : 0), 0) + challengesXp(journal);
  const level = levelFor(xp);
  return {
    stats,
    xp,
    level,
    levelTitle: levelTitle(level),
    levelProgress: xp - xpForLevel(level),
    levelSpan: xpForLevel(level + 1) - xpForLevel(level),
    milestones: ms,
    challenges: challengeStatuses(journal, today),
    streak: currentStreak(journal, today),
    playedToday: journal.byDay.has(today),
  };
}
