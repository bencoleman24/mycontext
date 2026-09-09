import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";

let cleanup: () => Promise<void>;
let dataDir: string;
let profileQuestionService: typeof import("../../src/services/profileQuestionService.js");

beforeEach(async () => {
  vi.resetModules();
  const temp = await useTempDataDir();
  dataDir = temp.dataDir;
  cleanup = temp.cleanup;
  profileQuestionService = await import("../../src/services/profileQuestionService.js");
});

afterEach(async () => {
  await cleanup();
});

describe("ensureDefaultProfileQuestions", () => {
  it("seeds the default questions (Priorities + 6 text questions) on first call", async () => {
    const questions = await profileQuestionService.listProfileQuestions();

    expect(questions).toHaveLength(7);
    const priorities = questions.find((q) => q.label === "Priorities");
    expect(priorities?.type).toBe("multiselect");
    expect(priorities && "options" in priorities ? priorities.options.length : 0).toBeGreaterThan(0);

    const textQuestions = questions.filter((q) => q.type === "text");
    expect(textQuestions).toHaveLength(6);
  });

  it("is a no-op on a second call", async () => {
    await profileQuestionService.listProfileQuestions();
    const created = await profileQuestionService.createProfileQuestion({ type: "text", label: "Extra" });

    // Calling listProfileQuestions again should not re-seed and wipe out the extra question.
    const questions = await profileQuestionService.listProfileQuestions();
    expect(questions).toHaveLength(8);
    expect(questions.some((q) => q.id === created.id)).toBe(true);
  });

  it("carries over answers from the legacy profile.focusAreas/additionalContext fields", async () => {
    const legacyProfile = {
      value: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Ada",
        goals: [],
        challenges: [],
        focusAreas: ["Health", "Career"],
        additionalContext: { typicalDay: "Code all day", whatDrivesYou: "Curiosity" },
        preferences: {},
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    };
    await writeFile(path.join(dataDir, "profile.json"), JSON.stringify(legacyProfile), "utf-8");

    const questions = await profileQuestionService.listProfileQuestions();

    const priorities = questions.find((q) => q.label === "Priorities");
    expect(priorities?.type).toBe("multiselect");
    if (priorities?.type === "multiselect") {
      expect(priorities.answer).toEqual(["Health", "Career"]);
    }

    const typicalDay = questions.find((q) => q.label === "What does your typical day look like?");
    expect(typicalDay?.type).toBe("text");
    if (typicalDay?.type === "text") {
      expect(typicalDay.answer).toBe("Code all day");
    }

    const whatDrivesYou = questions.find((q) => q.label === "What drives you?");
    if (whatDrivesYou?.type === "text") {
      expect(whatDrivesYou.answer).toBe("Curiosity");
    }
  });
});

describe("createProfileQuestion / deleteProfileQuestion", () => {
  it("creates a text question and a multiselect question with no initial options", async () => {
    const text = await profileQuestionService.createProfileQuestion({ type: "text", label: "Favorite book?" });
    expect(text.type).toBe("text");

    const multi = await profileQuestionService.createProfileQuestion({ type: "multiselect", label: "Hobbies?" });
    expect(multi.type).toBe("multiselect");
    if (multi.type === "multiselect") {
      expect(multi.options).toEqual([]);
    }
  });

  it("deletes a question", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "text", label: "Temp" });
    expect(await profileQuestionService.deleteProfileQuestion(q.id)).toBe(true);
    const remaining = await profileQuestionService.listProfileQuestions();
    expect(remaining.some((item) => item.id === q.id)).toBe(false);
  });
});

describe("answerProfileQuestion", () => {
  it("sets a text answer", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "text", label: "Q" });
    const answered = await profileQuestionService.answerProfileQuestion(q.id, "my answer");
    expect(answered.type).toBe("text");
    if (answered.type === "text") {
      expect(answered.answer).toBe("my answer");
    }
  });

  it("rejects a string answer for a multiselect question", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "multiselect", label: "Q" });
    await expect(profileQuestionService.answerProfileQuestion(q.id, "nope")).rejects.toThrow(/list of selected/i);
  });

  it("rejects an array answer for a text question", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "text", label: "Q" });
    await expect(profileQuestionService.answerProfileQuestion(q.id, ["a"])).rejects.toThrow(/text answer/i);
  });

  it("rejects a selected option that isn't in the question's options", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "multiselect", label: "Q" });
    await profileQuestionService.addProfileQuestionOption(q.id, "Red");
    await expect(profileQuestionService.answerProfileQuestion(q.id, ["Blue"])).rejects.toThrow(/Blue/);
  });
});

describe("addProfileQuestionOption / removeProfileQuestionOption", () => {
  it("adds options and does not duplicate an existing one", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "multiselect", label: "Q" });
    await profileQuestionService.addProfileQuestionOption(q.id, "Red");
    const updated = await profileQuestionService.addProfileQuestionOption(q.id, "Red");
    expect(updated.type).toBe("multiselect");
    if (updated.type === "multiselect") {
      expect(updated.options).toEqual(["Red"]);
    }
  });

  it("removing an option also removes it from the current answer", async () => {
    const q = await profileQuestionService.createProfileQuestion({ type: "multiselect", label: "Q" });
    await profileQuestionService.addProfileQuestionOption(q.id, "Red");
    await profileQuestionService.addProfileQuestionOption(q.id, "Blue");
    await profileQuestionService.answerProfileQuestion(q.id, ["Red", "Blue"]);

    const updated = await profileQuestionService.removeProfileQuestionOption(q.id, "Red");
    expect(updated.type).toBe("multiselect");
    if (updated.type === "multiselect") {
      expect(updated.options).toEqual(["Blue"]);
      expect(updated.answer).toEqual(["Blue"]);
    }
  });
});
