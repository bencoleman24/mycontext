import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";

let cleanup: () => Promise<void>;
let habitService: typeof import("../../src/services/habitService.js");

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-01-10T12:00:00.000Z"));
  const temp = await useTempDataDir();
  cleanup = temp.cleanup;
  habitService = await import("../../src/services/habitService.js");
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanup();
});

async function makeHabit(name = "Meditate", frequency?: "daily" | "weekly" | "monthly") {
  return habitService.createHabit({ name, frequency });
}

describe("habitService streak and completion math", () => {
  it("reports zero stats for a habit with no logs", async () => {
    const habit = await makeHabit();
    const [withStats] = await habitService.listHabits();
    expect(withStats.id).toBe(habit.id);
    expect(withStats.currentStreak).toBe(0);
    expect(withStats.longestStreak).toBe(0);
    expect(withStats.completionRate).toBe(0);
  });

  it("counts a current streak of consecutive Y days ending yesterday", async () => {
    const habit = await makeHabit();
    for (const date of ["2024-01-07", "2024-01-08", "2024-01-09"]) {
      await habitService.logHabitCompletion({ habitId: habit.id, date, status: "Y" });
    }

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(3);
  });

  it("does not count today toward the current streak yet", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-10", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(0);
  });

  it("breaks the current streak on a not-completed day", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-08", status: "N" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-07", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(1);
  });

  it("lets not-applicable days pass through without breaking the streak", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-08", status: "NA" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-07", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(2);
  });

  it("computes the longest streak across the whole history, not just the current run", async () => {
    const habit = await makeHabit();
    const statuses: Array<[string, "Y" | "N"]> = [
      ["2024-01-01", "Y"],
      ["2024-01-02", "Y"],
      ["2024-01-03", "Y"],
      ["2024-01-04", "N"],
      ["2024-01-05", "Y"],
      ["2024-01-06", "Y"],
    ];
    for (const [date, status] of statuses) {
      await habitService.logHabitCompletion({ habitId: habit.id, date, status });
    }

    const [withStats] = await habitService.listHabits();
    expect(withStats.longestStreak).toBe(3);
  });

  it("does not let a future-dated log inflate the longest streak", async () => {
    const habit = await makeHabit();
    // A real, in-the-past streak of 2.
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-08", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "Y" });
    // "Today" is fixed at 2024-01-10; log a couple of days into the future.
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-11", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-12", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.longestStreak).toBe(2);
  });

  it("does not let a future-dated log affect the current streak or completion rate either", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-15", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(1);
    expect(withStats.completionRate).toBe(1);
  });

  it("computes completion rate as Y / (Y + N), excluding NA and today", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-08", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "N" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-07", status: "NA" });
    // Logging today shouldn't affect the historical rate.
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-10", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.completionRate).toBeCloseTo(0.5);
  });

  it("upserts by habitId+date instead of creating duplicate logs", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "N" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "Y" });

    const history = await habitService.getHabitHistory(habit.id);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("Y");
  });

  it("excludes archived habits from listHabits by default", async () => {
    const habit = await makeHabit("Active habit");
    await habitService.setHabitArchived(habit.id, true);
    expect(await habitService.listHabits()).toHaveLength(0);
    expect(await habitService.listHabits(true)).toHaveLength(1);
  });

  it("archives and unarchives a habit", async () => {
    const habit = await makeHabit();
    const archived = await habitService.setHabitArchived(habit.id, true);
    expect(archived.archived).toBe(true);

    const restored = await habitService.setHabitArchived(habit.id, false);
    expect(restored.archived).toBe(false);
  });

  it("throws when archiving a habit that doesn't exist", async () => {
    await expect(habitService.setHabitArchived("11111111-1111-4111-8111-111111111111", true)).rejects.toThrow(
      /no habit found/i,
    );
  });

  it("deletes a habit and its entire logged history", async () => {
    const habit = await makeHabit();
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-08", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-09", status: "N" });

    const deleted = await habitService.deleteHabit(habit.id);
    expect(deleted).toBe(true);

    expect(await habitService.listHabits(true)).toHaveLength(0);
    expect(await habitService.getHabitHistory(habit.id)).toHaveLength(0);
  });

  it("returns false when deleting a habit that doesn't exist", async () => {
    expect(await habitService.deleteHabit("11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("defaults new habits to daily frequency", async () => {
    const habit = await makeHabit();
    expect(habit.frequency).toBe("daily");
  });
});

describe("weekly habits", () => {
  // "today" is fixed at 2024-01-10 (Wednesday), in the ISO week 2024-01-08..14.

  it("collapses check-ins on any day of the same week into one log entry", async () => {
    const habit = await makeHabit("Long run", "weekly");
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-03", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-05", status: "N" });

    const history = await habitService.getHabitHistory(habit.id);
    expect(history).toHaveLength(1);
    expect(history[0].date).toBe("2024-01-01"); // Monday of that week
    expect(history[0].status).toBe("N");
  });

  it("counts a current streak in consecutive weeks, not days", async () => {
    const habit = await makeHabit("Long run", "weekly");
    // Two previous weeks, checked in on different weekdays within each.
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-03", status: "Y" }); // week of Jan 1
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2023-12-27", status: "Y" }); // week of Dec 25

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(2);
  });

  it("does not count the current week toward the streak yet", async () => {
    const habit = await makeHabit("Long run", "weekly");
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2024-01-10", status: "Y" }); // this week

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(0);
    expect(withStats.currentPeriodStatus).toBe("Y");
  });
});

describe("monthly habits", () => {
  // "today" is fixed at 2024-01-10, in the month of 2024-01.

  it("collapses check-ins on any day of the same month into one log entry", async () => {
    const habit = await makeHabit("Budget review", "monthly");
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2023-12-05", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2023-12-28", status: "Y" });

    const history = await habitService.getHabitHistory(habit.id);
    expect(history).toHaveLength(1);
    expect(history[0].date).toBe("2023-12-01");
  });

  it("counts a current streak in consecutive months, not days", async () => {
    const habit = await makeHabit("Budget review", "monthly");
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2023-12-15", status: "Y" });
    await habitService.logHabitCompletion({ habitId: habit.id, date: "2023-11-02", status: "Y" });

    const [withStats] = await habitService.listHabits();
    expect(withStats.currentStreak).toBe(2);
  });
});
