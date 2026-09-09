import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProfileUpdateSchema } from "../schemas/profile.js";
import { getProfile, updateProfile } from "../services/profileService.js";
import { jsonResult } from "./toolResult.js";

export function registerProfileTools(server: McpServer): void {
  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description:
        "Get the user's fixed personal profile fields: name, age, location, occupation, bio, goals, challenges, and preferences. Use list_profile_questions for the user's custom (free-text or multiple-choice) questions and answers.",
    },
    async () => jsonResult(await getProfile()),
  );

  server.registerTool(
    "update_profile",
    {
      title: "Update profile",
      description:
        "Update one or more fields of the user's personal profile. Only the fields provided are changed; omitted fields are left as-is. Creates the profile if it doesn't exist yet.",
      inputSchema: ProfileUpdateSchema.shape,
    },
    async (input) => jsonResult(await updateProfile(input)),
  );
}
