import { z } from "zod";

export const HabitStatusSchema = z.enum(["Y", "N", "NA"]);
export type HabitStatus = z.infer<typeof HabitStatusSchema>;

export const HabitFrequencySchema = z.enum(["daily", "weekly", "monthly"]);
export type HabitFrequency = z.infer<typeof HabitFrequencySchema>;

export const HabitSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  frequency: HabitFrequencySchema.default("daily"),
  createdAt: z.iso.datetime(),
  archived: z.boolean().default(false),
});

export type Habit = z.infer<typeof HabitSchema>;

export const HABITS_SCHEMA_VERSION = 1;

export const HabitsFileSchema = z.object({
  items: z.array(HabitSchema).default([]),
});

export type HabitsFile = z.infer<typeof HabitsFileSchema>;

export const HabitLogSchema = z.object({
  id: z.uuid(),
  habitId: z.uuid(),
  date: z.iso.date(),
  status: HabitStatusSchema,
  note: z.string().optional(),
});

export type HabitLog = z.infer<typeof HabitLogSchema>;

export const HABIT_LOGS_SCHEMA_VERSION = 1;

export const HabitLogsFileSchema = z.object({
  items: z.array(HabitLogSchema).default([]),
});

export type HabitLogsFile = z.infer<typeof HabitLogsFileSchema>;

export const CreateHabitSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  frequency: HabitFrequencySchema.default("daily"),
});

export const LogHabitCompletionSchema = z.object({
  habitId: z.uuid(),
  date: z.iso.date(),
  status: HabitStatusSchema,
  note: z.string().optional(),
});

export interface HabitWithStats extends Habit {
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
  /**
   * This habit's logged status for the current period, if any has been
   * recorded yet -- today for daily habits, this week/month for weekly/monthly.
   */
  currentPeriodStatus?: HabitStatus;
}
