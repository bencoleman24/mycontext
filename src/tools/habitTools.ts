import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CreateHabitSchema, LogHabitCompletionSchema } from "../schemas/habit.js";
import {
  createHabit,
  deleteHabit,
  getHabitHistory,
  listHabits,
  logHabitCompletion,
  setHabitArchived,
} from "../services/habitService.js";
import { jsonResult } from "./toolResult.js";

export function registerHabitTools(server: McpServer): void {
  server.registerTool(
    "list_habits",
    {
      title: "List habits",
      description:
        "List the user's habits, including frequency (daily/weekly/monthly), current streak, longest streak, all-time completion rate, and whether the current period (today/this week/this month) has already been logged.",
      inputSchema: {
        includeArchived: z.boolean().optional().describe("Include archived habits (default false)."),
      },
    },
    async ({ includeArchived }) => jsonResult(await listHabits(includeArchived ?? false)),
  );

  server.registerTool(
    "create_habit",
    {
      title: "Create habit",
      description:
        "Create a new habit to track. Choose a frequency: daily (default), weekly, or monthly -- completion is checked in once per period.",
      inputSchema: CreateHabitSchema.shape,
    },
    async (input) => jsonResult(await createHabit(input)),
  );

  server.registerTool(
    "log_habit_completion",
    {
      title: "Log habit completion",
      description:
        "Record a habit's status for a given date (Y = completed, N = not completed, NA = not applicable). For weekly/monthly habits, the date is snapped to that period (e.g. any day in the week maps to the same weekly check-in). Calling this again for the same habit and period overwrites the previous value.",
      inputSchema: LogHabitCompletionSchema.shape,
    },
    async (input) => jsonResult(await logHabitCompletion(input)),
  );

  server.registerTool(
    "get_habit_history",
    {
      title: "Get habit history",
      description: "Get the day-by-day completion history for a single habit, optionally within a date range.",
      inputSchema: {
        habitId: z.uuid(),
        from: z.iso.date().optional().describe("Inclusive start date (YYYY-MM-DD)."),
        to: z.iso.date().optional().describe("Inclusive end date (YYYY-MM-DD)."),
      },
    },
    async ({ habitId, from, to }) => jsonResult(await getHabitHistory(habitId, from, to)),
  );

  server.registerTool(
    "archive_habit",
    {
      title: "Archive habit",
      description:
        "Archive a habit so it's hidden from the default habit list, without losing its history. Use unarchive_habit to bring it back.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult(await setHabitArchived(id, true)),
  );

  server.registerTool(
    "unarchive_habit",
    {
      title: "Unarchive habit",
      description: "Restore a previously archived habit so it shows up in the default habit list again.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult(await setHabitArchived(id, false)),
  );

  server.registerTool(
    "delete_habit",
    {
      title: "Delete habit",
      description: "Permanently delete a habit and its entire logged history. This cannot be undone -- archive_habit is the reversible alternative.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult({ deleted: await deleteHabit(id) }),
  );
}
