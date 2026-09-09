import { z } from "zod";

export const ProfileQuestionTypeSchema = z.enum(["text", "multiselect"]);
export type ProfileQuestionType = z.infer<typeof ProfileQuestionTypeSchema>;

const TextProfileQuestionSchema = z.object({
  id: z.uuid(),
  type: z.literal("text"),
  label: z.string().min(1).max(200),
  answer: z.string().default(""),
});

const MultiselectProfileQuestionSchema = z.object({
  id: z.uuid(),
  type: z.literal("multiselect"),
  label: z.string().min(1).max(200),
  options: z.array(z.string().min(1)).default([]),
  answer: z.array(z.string()).default([]),
});

export const ProfileQuestionSchema = z.discriminatedUnion("type", [
  TextProfileQuestionSchema,
  MultiselectProfileQuestionSchema,
]);

export type ProfileQuestion = z.infer<typeof ProfileQuestionSchema>;
export type TextProfileQuestion = z.infer<typeof TextProfileQuestionSchema>;
export type MultiselectProfileQuestion = z.infer<typeof MultiselectProfileQuestionSchema>;

export const PROFILE_QUESTIONS_SCHEMA_VERSION = 1;

export const ProfileQuestionsFileSchema = z.object({
  items: z.array(ProfileQuestionSchema).default([]),
});

export const CreateProfileQuestionSchema = z.object({
  type: ProfileQuestionTypeSchema,
  label: z.string().min(1).max(200),
  options: z.array(z.string().min(1)).optional(),
});

export const AnswerProfileQuestionSchema = z.object({
  answer: z.union([z.string(), z.array(z.string())]),
});

export const ProfileQuestionOptionSchema = z.object({
  option: z.string().min(1),
});
