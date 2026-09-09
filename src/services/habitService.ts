import { previousDate, startOfMonth, startOfWeek, nowIso, todayDate } from "../lib/dates.js";
import { newId } from "../lib/ids.js";
import { CreateHabitSchema, LogHabitCompletionSchema } from "../schemas/habit.js";
import type { Habit, HabitFrequency, HabitLog, HabitWithStats } from "../schemas/habit.js";
import { habitLogStore, habitStore } from "../storage/stores.js";
import type { z } from "zod";

/** Maps an arbitrary date to the canonical key for the period it falls in. */
function periodKeyFor(date: string, frequency: HabitFrequency): string {
  if (frequency === "weekly") return startOfWeek(date);
  if (frequency === "monthly") return startOfMonth(date);
  return date;
}

/** Steps one period key backward (a day, a week, or a month, depending on frequency). */
function previousPeriod(periodKey: string, frequency: HabitFrequency): string {
  if (frequency === "weekly") {
    const d = new Date(`${periodKey}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  }
  if (frequency === "monthly") {
    const d = new Date(`${periodKey}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  }
  return previousDate(periodKey);
}

function currentPeriodKey(frequency: HabitFrequency): string {
  return periodKeyFor(todayDate(), frequency);
}

/**
 * Current streak: consecutive completed ("Y") periods counting back from the
 * period before the current one. The current period is excluded so the streak
 * isn't penalized before it's over.
 */
function computeCurrentStreak(logsByDate: Map<string, HabitLog>, frequency: HabitFrequency): number {
  let streak = 0;
  let cursor = previousPeriod(currentPeriodKey(frequency), frequency);

  while (true) {
    const log = logsByDate.get(cursor);
    if (!log) break;
    if (log.status === "Y") {
      streak += 1;
      cursor = previousPeriod(cursor, frequency);
    } else if (log.status === "N") {
      break;
    } else {
      // "NA" periods don't break or extend the streak (habit didn't exist yet).
      cursor = previousPeriod(cursor, frequency);
    }
  }

  return streak;
}

/** Longest streak ever, excluding the current/future periods (a period isn't "done" yet). */
function computeLongestStreak(sortedLogs: HabitLog[], frequency: HabitFrequency): number {
  const current = currentPeriodKey(frequency);
  let longest = 0;
  let streak = 0;

  for (const log of sortedLogs) {
    if (log.date >= current) break; // sorted ascending, so nothing past this point counts either
    if (log.status === "Y") {
      streak += 1;
      longest = Math.max(longest, streak);
    } else if (log.status === "N") {
      streak = 0;
    }
    // "NA" neither breaks nor extends the run.
  }

  return longest;
}

/** Completion rate = Y / (Y + N), excluding NA and excluding the current period. */
function computeCompletionRate(logs: HabitLog[], frequency: HabitFrequency): number {
  const current = currentPeriodKey(frequency);
  let yes = 0;
  let no = 0;

  for (const log of logs) {
    if (log.date >= current) continue;
    if (log.status === "Y") yes += 1;
    else if (log.status === "N") no += 1;
  }

  const total = yes + no;
  return total > 0 ? yes / total : 0;
}

function withStats(habit: Habit, logs: HabitLog[]): HabitWithStats {
  const habitLogs = logs
    .filter((log) => log.habitId === habit.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const logsByDate = new Map(habitLogs.map((log) => [log.date, log]));

  return {
    ...habit,
    currentStreak: computeCurrentStreak(logsByDate, habit.frequency),
    longestStreak: computeLongestStreak(habitLogs, habit.frequency),
    completionRate: computeCompletionRate(habitLogs, habit.frequency),
    currentPeriodStatus: logsByDate.get(currentPeriodKey(habit.frequency))?.status,
  };
}

export async function listHabits(includeArchived = false): Promise<HabitWithStats[]> {
  const [habits, logs] = await Promise.all([habitStore.list(), habitLogStore.list()]);
  return habits
    .filter((habit) => includeArchived || !habit.archived)
    .map((habit) => withStats(habit, logs));
}

export async function createHabit(
  input: z.input<typeof CreateHabitSchema>,
): Promise<Habit> {
  const habit: Habit = {
    id: newId(),
    name: input.name,
    description: input.description,
    frequency: input.frequency ?? "daily",
    createdAt: nowIso(),
    archived: false,
  };
  return habitStore.upsert(habit);
}

export async function setHabitArchived(id: string, archived: boolean): Promise<Habit> {
  const habit = await habitStore.get(id);
  if (!habit) {
    throw new Error(`No habit found with id ${id}`);
  }
  return habitStore.upsert({ ...habit, archived });
}

/** Deletes a habit and all of its logged history. */
export async function deleteHabit(id: string): Promise<boolean> {
  const deleted = await habitStore.delete(id);
  if (deleted) {
    await habitLogStore.deleteMany((log) => log.habitId === id);
  }
  return deleted;
}

export async function logHabitCompletion(
  input: z.infer<typeof LogHabitCompletionSchema>,
): Promise<HabitLog> {
  const habit = await habitStore.get(input.habitId);
  if (!habit) {
    throw new Error(`No habit found with id ${input.habitId}`);
  }

  const periodKey = periodKeyFor(input.date, habit.frequency);
  const logs = await habitLogStore.list();
  const existing = logs.find(
    (log) => log.habitId === input.habitId && log.date === periodKey,
  );

  const log: HabitLog = {
    id: existing?.id ?? newId(),
    habitId: input.habitId,
    date: periodKey,
    status: input.status,
    note: input.note,
  };

  return habitLogStore.upsert(log);
}

export async function getHabitHistory(
  habitId: string,
  from?: string,
  to?: string,
): Promise<HabitLog[]> {
  const logs = await habitLogStore.list();
  return logs
    .filter((log) => log.habitId === habitId)
    .filter((log) => (from ? log.date >= from : true))
    .filter((log) => (to ? log.date <= to : true))
    .sort((a, b) => a.date.localeCompare(b.date));
}
