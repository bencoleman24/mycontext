import { newId } from "../lib/ids.js";
import { FOCUS_AREA_OPTIONS } from "../schemas/profile.js";
import type { CreateProfileQuestionSchema, ProfileQuestion } from "../schemas/profileQuestion.js";
import { profileQuestionStore } from "../storage/stores.js";
import { getProfile } from "./profileService.js";
import type { z } from "zod";

const DEFAULT_TEXT_QUESTIONS: Array<{ legacyKey: string; label: string }> = [
  { legacyKey: "typicalDay", label: "What does your typical day look like?" },
  { legacyKey: "habitsWantToBuild", label: "What habits do you want to build?" },
  { legacyKey: "whatDrivesYou", label: "What drives you?" },
  { legacyKey: "values", label: "What are some values or principles you live by?" },
  { legacyKey: "importantPeople", label: "Who are the most important people in your life?" },
  { legacyKey: "freeformEntry", label: "Anything else you'd like your data profile to include?" },
];

/**
 * One-time, idempotent seed/migration: if no questions exist yet, create the familiar
 * defaults (Priorities + the old fixed "additional context" questions), carrying over
 * any answers from the legacy Profile.focusAreas/additionalContext fields so existing
 * data isn't lost when this system replaces them.
 */
export async function ensureDefaultProfileQuestions(): Promise<void> {
  const existing = await profileQuestionStore.list();
  if (existing.length > 0) return;

  const profile = await getProfile();

  const priorities: ProfileQuestion = {
    id: newId(),
    type: "multiselect",
    label: "Priorities",
    options: [...FOCUS_AREA_OPTIONS],
    answer: profile?.focusAreas ?? [],
  };
  await profileQuestionStore.upsert(priorities);

  for (const { legacyKey, label } of DEFAULT_TEXT_QUESTIONS) {
    const question: ProfileQuestion = {
      id: newId(),
      type: "text",
      label,
      answer: profile?.additionalContext?.[legacyKey] ?? "",
    };
    await profileQuestionStore.upsert(question);
  }
}

export async function listProfileQuestions(): Promise<ProfileQuestion[]> {
  await ensureDefaultProfileQuestions();
  return profileQuestionStore.list();
}

export async function createProfileQuestion(
  input: z.infer<typeof CreateProfileQuestionSchema>,
): Promise<ProfileQuestion> {
  if (input.type === "multiselect") {
    // Options can be added afterward via addProfileQuestionOption -- an empty
    // list just means nothing is selectable yet, which is a valid starting state.
    return profileQuestionStore.upsert({
      id: newId(),
      type: "multiselect",
      label: input.label,
      options: input.options ?? [],
      answer: [],
    });
  }

  return profileQuestionStore.upsert({
    id: newId(),
    type: "text",
    label: input.label,
    answer: "",
  });
}

export async function deleteProfileQuestion(id: string): Promise<boolean> {
  return profileQuestionStore.delete(id);
}

export async function answerProfileQuestion(
  id: string,
  answer: string | string[],
): Promise<ProfileQuestion> {
  const question = await profileQuestionStore.get(id);
  if (!question) {
    throw new Error(`No profile question found with id ${id}`);
  }

  if (question.type === "text") {
    if (typeof answer !== "string") {
      throw new Error(`"${question.label}" expects a text answer.`);
    }
    return profileQuestionStore.upsert({ ...question, answer });
  }

  if (!Array.isArray(answer)) {
    throw new Error(`"${question.label}" expects a list of selected options.`);
  }
  const invalid = answer.filter((value) => !question.options.includes(value));
  if (invalid.length > 0) {
    throw new Error(`"${question.label}" doesn't have these option(s): ${invalid.join(", ")}`);
  }
  return profileQuestionStore.upsert({ ...question, answer });
}

export async function addProfileQuestionOption(id: string, option: string): Promise<ProfileQuestion> {
  const question = await profileQuestionStore.get(id);
  if (!question) {
    throw new Error(`No profile question found with id ${id}`);
  }
  if (question.type !== "multiselect") {
    throw new Error(`"${question.label}" is a text question and doesn't have options.`);
  }
  if (question.options.includes(option)) {
    return question;
  }
  return profileQuestionStore.upsert({ ...question, options: [...question.options, option] });
}

export async function removeProfileQuestionOption(id: string, option: string): Promise<ProfileQuestion> {
  const question = await profileQuestionStore.get(id);
  if (!question) {
    throw new Error(`No profile question found with id ${id}`);
  }
  if (question.type !== "multiselect") {
    throw new Error(`"${question.label}" is a text question and doesn't have options.`);
  }
  return profileQuestionStore.upsert({
    ...question,
    options: question.options.filter((o) => o !== option),
    answer: question.answer.filter((a) => a !== option),
  });
}
