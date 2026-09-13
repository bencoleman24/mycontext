import { z } from "zod";
import { RangeFromSchema, RangeToSchema } from "./dateRange.js";

export const ThoughtSchema = z.object({
  id: z.uuid(),
  title: z.string().optional(),
  content: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export type Thought = z.infer<typeof ThoughtSchema>;

export const THOUGHTS_SCHEMA_VERSION = 1;

export const ThoughtsFileSchema = z.object({
  items: z.array(ThoughtSchema).default([]),
});

export type ThoughtsFile = z.infer<typeof ThoughtsFileSchema>;

export const AddThoughtSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
});

export const ListThoughtsSchema = z.object({
  from: RangeFromSchema,
  to: RangeToSchema,
  limit: z.number().int().positive().max(500).default(50),
});
