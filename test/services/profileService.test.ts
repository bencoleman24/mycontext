import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { useTempDataDir } from "../testDataDir.js";

let cleanup: () => Promise<void>;
let profileService: typeof import("../../src/services/profileService.js");

beforeEach(async () => {
  vi.resetModules();
  const temp = await useTempDataDir();
  cleanup = temp.cleanup;
  profileService = await import("../../src/services/profileService.js");
});

afterEach(async () => {
  await cleanup();
});

describe("profileService", () => {
  it("returns null when no profile has been saved yet", async () => {
    expect(await profileService.getProfile()).toBeNull();
  });

  it("creates a profile on first update, assigning an id", async () => {
    const profile = await profileService.updateProfile({ name: "Ada" });

    expect(profile.id).toBeTruthy();
    expect(profile.name).toBe("Ada");
    expect(profile.goals).toEqual([]);
    expect(await profileService.getProfile()).toEqual(profile);
  });

  it("merges partial updates instead of overwriting the whole profile", async () => {
    await profileService.updateProfile({ name: "Ada", location: "London" });
    const updated = await profileService.updateProfile({ occupation: "Engineer" });

    expect(updated.name).toBe("Ada");
    expect(updated.location).toBe("London");
    expect(updated.occupation).toBe("Engineer");
  });

  it("keeps the same id across repeated updates", async () => {
    const first = await profileService.updateProfile({ name: "Ada" });
    const second = await profileService.updateProfile({ name: "Ada Lovelace" });

    expect(second.id).toBe(first.id);
  });

  it("replaces an array field entirely when given a new one, rather than merging entries", async () => {
    await profileService.updateProfile({ goals: ["Ship it"] });
    const updated = await profileService.updateProfile({ goals: ["Ship it", "Rest"] });

    expect(updated.goals).toEqual(["Ship it", "Rest"]);
  });

  it("clears an array field when explicitly given an empty array", async () => {
    await profileService.updateProfile({ goals: ["Ship it"] });
    const updated = await profileService.updateProfile({ goals: [] });

    expect(updated.goals).toEqual([]);
  });

  it("returns the absolute path to profile.json under the configured data dir", async () => {
    expect(profileService.getProfilePath()).toMatch(/profile\.json$/);
  });
});
