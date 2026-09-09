import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previousDate, startOfMonth, startOfWeek, todayDate } from "../../src/lib/dates.js";

describe("previousDate", () => {
  it("steps back a single day within a month", () => {
    expect(previousDate("2024-01-10")).toBe("2024-01-09");
  });

  it("crosses a month boundary", () => {
    expect(previousDate("2024-03-01")).toBe("2024-02-29"); // 2024 is a leap year
  });

  it("crosses a year boundary", () => {
    expect(previousDate("2024-01-01")).toBe("2023-12-31");
  });
});

describe("startOfWeek", () => {
  it("returns the same date when given a Monday", () => {
    expect(startOfWeek("2024-01-08")).toBe("2024-01-08");
  });

  it("returns the prior Monday for a mid-week date", () => {
    expect(startOfWeek("2024-01-10")).toBe("2024-01-08");
  });

  it("returns the prior Monday for a Sunday (end of the ISO week)", () => {
    expect(startOfWeek("2024-01-14")).toBe("2024-01-08");
  });

  it("crosses a month boundary when the week's Monday falls in the previous month", () => {
    // 2024-02-01 is a Thursday; that week's Monday is in January.
    expect(startOfWeek("2024-02-01")).toBe("2024-01-29");
  });

  it("crosses a year boundary when the week's Monday falls in the previous year", () => {
    // 2025-01-01 is a Wednesday; that week's Monday is in December 2024.
    expect(startOfWeek("2025-01-01")).toBe("2024-12-30");
  });
});

describe("startOfMonth", () => {
  it("returns the 1st of the given month", () => {
    expect(startOfMonth("2024-02-17")).toBe("2024-02-01");
  });

  it("handles a leap-year February", () => {
    expect(startOfMonth("2024-02-29")).toBe("2024-02-01");
  });
});

describe("todayDate", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("returns the local calendar day, not the UTC day, when they differ", () => {
    process.env.TZ = "America/Los_Angeles";
    // 8:30pm PST on Jan 10 -- already Jan 11 in UTC.
    vi.setSystemTime(new Date("2024-01-11T04:30:00.000Z"));

    expect(todayDate()).toBe("2024-01-10");
  });

  it("still returns the UTC day when local and UTC agree", () => {
    process.env.TZ = "UTC";
    vi.setSystemTime(new Date("2024-01-10T12:00:00.000Z"));

    expect(todayDate()).toBe("2024-01-10");
  });

  it("rolls over correctly for a timezone east of UTC too", () => {
    process.env.TZ = "Asia/Tokyo"; // UTC+9
    // 1am JST on Jan 11 -- still Jan 10 in UTC.
    vi.setSystemTime(new Date("2024-01-10T16:00:00.000Z"));

    expect(todayDate()).toBe("2024-01-11");
  });
});
