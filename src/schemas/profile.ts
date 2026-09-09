import { z } from "zod";

export const FOCUS_AREA_OPTIONS = [
  "Health",
  "Career",
  "Learning",
  "Relationships",
  "Finances",
  "Creativity",
  "Mental Wellbeing",
  "Fitness",
  "Productivity",
  "Nutrition",
  "Sleep",
  "Personal Development",
  "Spirituality",
] as const;

export const ProfileSchema = z.object({
  id: z.uuid(),
  name: z.string().optional(),
  bio: z.string().optional(),
  age: z.number().int().min(0).max(150).optional(),
  location: z.string().optional(),
  occupation: z.string().optional(),
  goals: z.array(z.string()).default([]),
  challenges: z.array(z.string()).default([]),
  // Legacy: superseded by the profileQuestion system (src/schemas/profileQuestion.ts).
  // Kept here (read-only) purely so old profile.json data still parses for the one-time migration.
  focusAreas: z.array(z.string()).default([]),
  additionalContext: z.record(z.string(), z.string()).default({}),
  preferences: z.record(z.string(), z.string()).default({}),
  updatedAt: z.iso.datetime(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const PROFILE_SCHEMA_VERSION = 1;

export const ProfileFileSchema = z.object({
  value: ProfileSchema.nullable(),
});

export type ProfileFile = z.infer<typeof ProfileFileSchema>;

export const ProfileUpdateSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional(),
  age: z.number().int().min(0).max(150).optional(),
  location: z.string().optional(),
  occupation: z.string().optional(),
  goals: z.array(z.string()).optional(),
  challenges: z.array(z.string()).optional(),
  preferences: z.record(z.string(), z.string()).optional(),
});

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
