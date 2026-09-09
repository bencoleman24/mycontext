import { z } from "zod";
import { todayDate } from "../lib/dates.js";
import { AddJournalEntrySchema, SetJournalSummarySchema, UpdateJournalEntrySchema } from "../schemas/journal.js";
import { AddThoughtSchema } from "../schemas/thought.js";
import { CreateHabitSchema, HabitStatusSchema } from "../schemas/habit.js";
import { ProfileUpdateSchema } from "../schemas/profile.js";
import {
  AnswerProfileQuestionSchema,
  CreateProfileQuestionSchema,
  ProfileQuestionOptionSchema,
} from "../schemas/profileQuestion.js";
import { UploadFileSchema } from "../schemas/file.js";
import { getProfile, getProfilePath, updateProfile } from "../services/profileService.js";
import {
  addProfileQuestionOption,
  answerProfileQuestion,
  createProfileQuestion,
  deleteProfileQuestion,
  listProfileQuestions,
  removeProfileQuestionOption,
} from "../services/profileQuestionService.js";
import { ExportRequestSchema, exportContext, exportHabitsCsvToDisk } from "../services/exportService.js";
import {
  createHabit,
  deleteHabit,
  getHabitHistory,
  listHabits,
  logHabitCompletion,
  setHabitArchived,
} from "../services/habitService.js";
import {
  addJournalEntry,
  backfillJournalSummaries,
  deleteJournalEntry,
  generateJournalSummary,
  searchJournal,
  setJournalSummary,
  updateJournalEntry,
} from "../services/journalService.js";
import { addThought, deleteThought, listThoughts } from "../services/thoughtService.js";
import { deleteFile, getFile, listFiles, uploadFile } from "../services/fileService.js";

export interface ApiRequest {
  method: string;
  segments: string[];
  searchParams: URLSearchParams;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

const LogCompletionSchema = z.object({
  date: z.iso.date().optional(),
  status: HabitStatusSchema,
  note: z.string().optional(),
});

function ok(body: unknown): ApiResponse {
  return { status: 200, body };
}

function notFound(): ApiResponse {
  return { status: 404, body: { error: "Not found" } };
}

function badRequest(message: string): ApiResponse {
  return { status: 400, body: { error: message } };
}

/** Routes /api/* requests to the same service layer the MCP tools use. */
export async function handleApi(req: ApiRequest): Promise<ApiResponse> {
  const { method, segments, searchParams, body } = req;

  try {
    // /api/profile
    if (segments.length === 1 && segments[0] === "profile") {
      if (method === "GET") return ok(await getProfile());
      if (method === "PUT") return ok(await updateProfile(ProfileUpdateSchema.parse(body)));
    }

    // /api/profile/path
    if (segments.length === 2 && segments[0] === "profile" && segments[1] === "path" && method === "GET") {
      return ok({ path: getProfilePath() });
    }

    // /api/export
    if (segments.length === 1 && segments[0] === "export" && method === "POST") {
      return ok(await exportContext(ExportRequestSchema.parse(body)));
    }

    // /api/profile-questions
    if (segments.length === 1 && segments[0] === "profile-questions") {
      if (method === "GET") return ok(await listProfileQuestions());
      if (method === "POST") return ok(await createProfileQuestion(CreateProfileQuestionSchema.parse(body)));
    }

    // /api/profile-questions/:id
    if (segments.length === 2 && segments[0] === "profile-questions") {
      const id = segments[1];
      if (method === "PATCH") {
        const input = AnswerProfileQuestionSchema.parse(body);
        return ok(await answerProfileQuestion(id, input.answer));
      }
      if (method === "DELETE") return ok({ deleted: await deleteProfileQuestion(id) });
    }

    // /api/profile-questions/:id/options
    if (segments.length === 3 && segments[0] === "profile-questions" && segments[2] === "options") {
      const id = segments[1];
      if (method === "POST") {
        const input = ProfileQuestionOptionSchema.parse(body);
        return ok(await addProfileQuestionOption(id, input.option));
      }
      if (method === "DELETE") {
        const option = searchParams.get("option");
        if (!option) return badRequest("Missing option query parameter.");
        return ok(await removeProfileQuestionOption(id, option));
      }
    }

    // /api/habits
    if (segments.length === 1 && segments[0] === "habits") {
      if (method === "GET") return ok(await listHabits(searchParams.get("includeArchived") === "true"));
      if (method === "POST") return ok(await createHabit(CreateHabitSchema.parse(body)));
    }

    // /api/habits/csv
    if (segments.length === 2 && segments[0] === "habits" && segments[1] === "csv" && method === "GET") {
      return ok(await exportHabitsCsvToDisk());
    }

    // /api/habits/:id
    if (segments.length === 2 && segments[0] === "habits" && segments[1] !== "csv") {
      const id = segments[1];
      if (method === "PATCH") {
        const input = z.object({ archived: z.boolean() }).parse(body);
        return ok(await setHabitArchived(id, input.archived));
      }
      if (method === "DELETE") return ok({ deleted: await deleteHabit(id) });
    }

    // /api/habits/:id/log
    if (segments.length === 3 && segments[0] === "habits" && segments[2] === "log" && method === "POST") {
      const input = LogCompletionSchema.parse(body);
      return ok(
        await logHabitCompletion({
          habitId: segments[1],
          date: input.date ?? todayDate(),
          status: input.status,
          note: input.note,
        }),
      );
    }

    // /api/habits/:id/history
    if (segments.length === 3 && segments[0] === "habits" && segments[2] === "history" && method === "GET") {
      return ok(
        await getHabitHistory(
          segments[1],
          searchParams.get("from") ?? undefined,
          searchParams.get("to") ?? undefined,
        ),
      );
    }

    // /api/journal
    if (segments.length === 1 && segments[0] === "journal") {
      if (method === "GET") {
        const limitParam = searchParams.get("limit");
        return ok(
          await searchJournal({
            query: searchParams.get("query") ?? undefined,
            limit: limitParam ? Number.parseInt(limitParam, 10) : 50,
          }),
        );
      }
      if (method === "POST") return ok(await addJournalEntry(AddJournalEntrySchema.parse(body)));
    }

    // /api/journal/:id
    if (segments.length === 2 && segments[0] === "journal") {
      const id = segments[1];
      if (method === "PATCH") {
        return ok(await updateJournalEntry(UpdateJournalEntrySchema.parse({ ...(body as object), id })));
      }
      if (method === "DELETE") return ok({ deleted: await deleteJournalEntry(id) });
    }

    // /api/journal/summaries/backfill
    if (
      segments.length === 3 &&
      segments[0] === "journal" &&
      segments[1] === "summaries" &&
      segments[2] === "backfill" &&
      method === "POST"
    ) {
      return ok(await backfillJournalSummaries());
    }

    // /api/journal/:id/summary
    if (segments.length === 3 && segments[0] === "journal" && segments[2] === "summary" && method === "PUT") {
      const input = SetJournalSummarySchema.parse(body);
      return ok(await setJournalSummary(segments[1], input.summary, "manual"));
    }

    // /api/journal/:id/summary/generate
    if (
      segments.length === 4 &&
      segments[0] === "journal" &&
      segments[2] === "summary" &&
      segments[3] === "generate" &&
      method === "POST"
    ) {
      return ok(await generateJournalSummary(segments[1]));
    }

    // /api/thoughts
    if (segments.length === 1 && segments[0] === "thoughts") {
      if (method === "GET") {
        const limitParam = searchParams.get("limit");
        return ok(await listThoughts({ limit: limitParam ? Number.parseInt(limitParam, 10) : 50 }));
      }
      if (method === "POST") return ok(await addThought(AddThoughtSchema.parse(body)));
    }

    // /api/thoughts/:id
    if (segments.length === 2 && segments[0] === "thoughts" && method === "DELETE") {
      return ok({ deleted: await deleteThought(segments[1]) });
    }

    // /api/files
    if (segments.length === 1 && segments[0] === "files") {
      if (method === "GET") return ok(await listFiles(searchParams.get("journalEntryId") ?? undefined));
      if (method === "POST") return ok(await uploadFile(UploadFileSchema.parse(body)));
    }

    // /api/files/:id
    if (segments.length === 2 && segments[0] === "files") {
      if (method === "GET") {
        const file = await getFile(segments[1]);
        return file ? ok(file) : notFound();
      }
      if (method === "DELETE") return ok({ deleted: await deleteFile(segments[1]) });
    }

    return notFound();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return badRequest(err.message);
    }
    if (err instanceof Error) {
      return badRequest(err.message);
    }
    throw err;
  }
}
