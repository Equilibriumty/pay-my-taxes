import { describe, expect, test } from "bun:test";
import {
  monthsToYears,
  yearsToMonths,
  weeksToDays,
  daysToWeeks,
  daysToMonths,
  brand,
} from "../utils/period-conversion";

describe("Period Conversion Utilities", () => {
  describe("monthsToYears", () => {
    test("should convert months to years correctly", () => {
      const months = brand<"months">(12);
      const years = brand<"years">(1);
      expect(monthsToYears(months)).toBe(years);
      expect(monthsToYears(brand<"months">(24))).toBe(brand<"years">(2));
      expect(monthsToYears(brand<"months">(6))).toBe(brand<"years">(0.5));
    });

    test("should handle fractional months", () => {
      const months = brand<"months">(18);
      const years = brand<"years">(1.5);
      expect(monthsToYears(months)).toBe(years);
      expect(monthsToYears(brand<"months">(3))).toBe(brand<"years">(0.25));
    });

    test("should handle zero months", () => {
      expect(monthsToYears(brand<"months">(0))).toBe(brand<"years">(0));
    });
  });

  describe("yearsToMonths", () => {
    test("should convert years to months correctly", () => {
      const years = brand<"years">(1);
      const months = brand<"months">(12);
      expect(yearsToMonths(years)).toBe(months);
      expect(yearsToMonths(brand<"years">(2))).toBe(brand<"months">(24));
      expect(yearsToMonths(brand<"years">(0.5))).toBe(brand<"months">(6));
    });

    test("should handle fractional years", () => {
      const years = brand<"years">(1.5);
      const months = brand<"months">(18);
      expect(yearsToMonths(years)).toBe(months);
      expect(yearsToMonths(brand<"years">(0.25))).toBe(brand<"months">(3));
    });

    test("should handle zero years", () => {
      expect(yearsToMonths(brand<"years">(0))).toBe(brand<"months">(0));
    });
  });

  describe("weeksToDays", () => {
    test("should convert weeks to days correctly", () => {
      const weeks = brand<"weeks">(1);
      const days = brand<"days">(7);
      expect(weeksToDays(weeks)).toBe(days);
      expect(weeksToDays(brand<"weeks">(2))).toBe(brand<"days">(14));
      expect(weeksToDays(brand<"weeks">(0.5))).toBe(brand<"days">(3.5));
    });

    test("should handle fractional weeks", () => {
      const weeks = brand<"weeks">(1.5);
      const days = brand<"days">(10.5);
      expect(weeksToDays(weeks)).toBe(days);
      expect(weeksToDays(brand<"weeks">(0.25))).toBe(brand<"days">(1.75));
    });

    test("should handle zero weeks", () => {
      expect(weeksToDays(brand<"weeks">(0))).toBe(brand<"days">(0));
    });
  });

  describe("daysToWeeks", () => {
    test("should convert days to weeks correctly", () => {
      const days = brand<"days">(7);
      const weeks = brand<"weeks">(1);
      expect(daysToWeeks(days)).toBe(weeks);
      expect(daysToWeeks(brand<"days">(14))).toBe(brand<"weeks">(2));
      expect(daysToWeeks(brand<"days">(3.5))).toBe(brand<"weeks">(0.5));
    });

    test("should handle fractional days", () => {
      const days = brand<"days">(10.5);
      const weeks = brand<"weeks">(1.5);
      expect(daysToWeeks(days)).toBe(weeks);
      expect(daysToWeeks(brand<"days">(1.75))).toBe(brand<"weeks">(0.25));
    });

    test("should handle zero days", () => {
      expect(daysToWeeks(brand<"days">(0))).toBe(brand<"weeks">(0));
    });
  });

  describe("daysToMonths", () => {
    test("should convert days to months using 30-day approximation", () => {
      expect(daysToMonths(brand<"days">(30))).toBe(brand<"months">(1));
      expect(daysToMonths(brand<"days">(60))).toBe(brand<"months">(2));
      expect(daysToMonths(brand<"days">(15))).toBe(brand<"months">(0.5));
    });

    test("should handle fractional days", () => {
      expect(daysToMonths(brand<"days">(45))).toBe(brand<"months">(1.5));
      expect(daysToMonths(brand<"days">(7.5))).toBe(brand<"months">(0.25));
    });

    test("should handle zero days", () => {
      expect(daysToMonths(brand<"days">(0))).toBe(brand<"months">(0));
    });
  });

  describe("round-trip conversions", () => {
    test("months -> years -> months should be approximately equal", () => {
      const original = brand<"months">(24);
      const result = yearsToMonths(monthsToYears(original));
      expect(result).toBeCloseTo(24, 10);
    });

    test("weeks -> days -> weeks should be approximately equal", () => {
      const original = brand<"weeks">(8);
      const result = daysToWeeks(weeksToDays(original));
      expect(result).toBeCloseTo(8, 10);
    });
  });
});
