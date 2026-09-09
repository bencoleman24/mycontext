import path from "node:path";
import { getDataDir } from "../config.js";
import {
  FILES_SCHEMA_VERSION,
  FilesFileSchema,
  HABIT_LOGS_SCHEMA_VERSION,
  HABITS_SCHEMA_VERSION,
  HabitLogsFileSchema,
  HabitsFileSchema,
  JOURNAL_SCHEMA_VERSION,
  JournalFileSchema,
  PROFILE_QUESTIONS_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  ProfileFileSchema,
  ProfileQuestionsFileSchema,
  THOUGHTS_SCHEMA_VERSION,
  ThoughtsFileSchema,
} from "../schemas/index.js";
import type { FileAttachment } from "../schemas/file.js";
import type { Habit, HabitLog } from "../schemas/habit.js";
import type { JournalEntry } from "../schemas/journal.js";
import type { Profile } from "../schemas/profile.js";
import type { ProfileQuestion } from "../schemas/profileQuestion.js";
import type { Thought } from "../schemas/thought.js";
import { JsonCollectionStore, JsonSingletonStore } from "./jsonFileStore.js";

const dataDir = getDataDir();

/** Directory where uploaded files' raw bytes are stored, named by server-generated id. */
export const uploadsDir = path.join(dataDir, "uploads");

export const profileStore = new JsonSingletonStore<Profile>(
  path.join(dataDir, "profile.json"),
  ProfileFileSchema,
  PROFILE_SCHEMA_VERSION,
);

export const habitStore = new JsonCollectionStore<Habit>(
  path.join(dataDir, "habits.json"),
  HabitsFileSchema,
  HABITS_SCHEMA_VERSION,
);

export const habitLogStore = new JsonCollectionStore<HabitLog>(
  path.join(dataDir, "habit-logs.json"),
  HabitLogsFileSchema,
  HABIT_LOGS_SCHEMA_VERSION,
);

export const journalStore = new JsonCollectionStore<JournalEntry>(
  path.join(dataDir, "journal.json"),
  JournalFileSchema,
  JOURNAL_SCHEMA_VERSION,
);

export const thoughtStore = new JsonCollectionStore<Thought>(
  path.join(dataDir, "thoughts.json"),
  ThoughtsFileSchema,
  THOUGHTS_SCHEMA_VERSION,
);

export const fileStore = new JsonCollectionStore<FileAttachment>(
  path.join(dataDir, "files.json"),
  FilesFileSchema,
  FILES_SCHEMA_VERSION,
);

export const profileQuestionStore = new JsonCollectionStore<ProfileQuestion>(
  path.join(dataDir, "profile-questions.json"),
  ProfileQuestionsFileSchema,
  PROFILE_QUESTIONS_SCHEMA_VERSION,
);
