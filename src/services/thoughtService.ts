import { nowIso } from "../lib/dates.js";
import { newId } from "../lib/ids.js";
import { AddThoughtSchema, ListThoughtsSchema } from "../schemas/thought.js";
import type { Thought } from "../schemas/thought.js";
import { thoughtStore } from "../storage/stores.js";
import type { z } from "zod";

export async function addThought(input: z.infer<typeof AddThoughtSchema>): Promise<Thought> {
  const thought: Thought = {
    id: newId(),
    title: input.title,
    content: input.content,
    createdAt: nowIso(),
  };
  return thoughtStore.upsert(thought);
}

export async function listThoughts(
  input: z.infer<typeof ListThoughtsSchema>,
): Promise<Thought[]> {
  const thoughts = await thoughtStore.list();
  return thoughts
    .filter((thought) => (input.from ? thought.createdAt >= input.from : true))
    .filter((thought) => (input.to ? thought.createdAt <= input.to : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit);
}

export async function deleteThought(id: string): Promise<boolean> {
  return thoughtStore.delete(id);
}
