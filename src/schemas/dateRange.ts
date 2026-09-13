import { z } from "zod";

/** A range bound AI clients can send either as a plain date or a full timestamp. */
const DateBoundSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const RangeFromSchema = DateBoundSchema.optional().describe(
  "Inclusive start. A date like 2026-09-06 (from the start of that day, UTC) or a full ISO 8601 timestamp.",
);

export const RangeToSchema = DateBoundSchema.optional().describe(
  "Inclusive end. A date like 2026-09-06 (through the end of that day, UTC) or a full ISO 8601 timestamp.",
);
