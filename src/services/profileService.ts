import path from "node:path";
import { getDataDir } from "../config.js";
import { newId } from "../lib/ids.js";
import { nowIso } from "../lib/dates.js";
import type { Profile, ProfileUpdate } from "../schemas/profile.js";
import { profileStore } from "../storage/stores.js";

export async function getProfile(): Promise<Profile | null> {
  return profileStore.read();
}

/** Absolute path to the profile's JSON file on disk. */
export function getProfilePath(): string {
  return path.join(getDataDir(), "profile.json");
}

export async function updateProfile(update: ProfileUpdate): Promise<Profile> {
  return profileStore.update((existing) => ({
    id: existing?.id ?? newId(),
    name: update.name ?? existing?.name,
    bio: update.bio ?? existing?.bio,
    age: update.age ?? existing?.age,
    location: update.location ?? existing?.location,
    occupation: update.occupation ?? existing?.occupation,
    goals: update.goals ?? existing?.goals ?? [],
    challenges: update.challenges ?? existing?.challenges ?? [],
    // Legacy fields are frozen -- no longer a valid update input, see ProfileSchema.
    focusAreas: existing?.focusAreas ?? [],
    additionalContext: existing?.additionalContext ?? {},
    preferences: update.preferences ?? existing?.preferences ?? {},
    updatedAt: nowIso(),
  }));
}
