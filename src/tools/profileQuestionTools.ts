import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CreateProfileQuestionSchema } from "../schemas/profileQuestion.js";
import {
  addProfileQuestionOption,
  answerProfileQuestion,
  createProfileQuestion,
  deleteProfileQuestion,
  listProfileQuestions,
  removeProfileQuestionOption,
} from "../services/profileQuestionService.js";
import { jsonResult } from "./toolResult.js";

export function registerProfileQuestionTools(server: McpServer): void {
  server.registerTool(
    "list_profile_questions",
    {
      title: "List profile questions",
      description:
        "List the user's custom profile questions (free-text or multiple-choice) and their current answers. These are user-defined, in addition to the fixed profile fields from get_profile.",
    },
    async () => jsonResult(await listProfileQuestions()),
  );

  server.registerTool(
    "create_profile_question",
    {
      title: "Create profile question",
      description:
        "Add a new custom profile question. Type 'text' for a free-text answer, or 'multiselect' for a multiple-choice question (requires at least one option).",
      inputSchema: CreateProfileQuestionSchema.shape,
    },
    async (input) => jsonResult(await createProfileQuestion(input)),
  );

  server.registerTool(
    "answer_profile_question",
    {
      title: "Answer profile question",
      description:
        "Set the answer to a profile question by id. Pass a string for a text question, or an array of selected options (must already exist on the question) for a multiselect question.",
      inputSchema: {
        id: z.uuid(),
        answer: z.union([z.string(), z.array(z.string())]),
      },
    },
    async ({ id, answer }) => jsonResult(await answerProfileQuestion(id, answer)),
  );

  server.registerTool(
    "add_profile_question_option",
    {
      title: "Add profile question option",
      description: "Add a new selectable option to a multiselect profile question.",
      inputSchema: { id: z.uuid(), option: z.string().min(1) },
    },
    async ({ id, option }) => jsonResult(await addProfileQuestionOption(id, option)),
  );

  server.registerTool(
    "remove_profile_question_option",
    {
      title: "Remove profile question option",
      description:
        "Remove an option from a multiselect profile question. If it was currently selected, it's also removed from the answer.",
      inputSchema: { id: z.uuid(), option: z.string().min(1) },
    },
    async ({ id, option }) => jsonResult(await removeProfileQuestionOption(id, option)),
  );

  server.registerTool(
    "delete_profile_question",
    {
      title: "Delete profile question",
      description: "Permanently delete a custom profile question and its answer.",
      inputSchema: { id: z.uuid() },
    },
    async ({ id }) => jsonResult({ deleted: await deleteProfileQuestion(id) }),
  );
}
