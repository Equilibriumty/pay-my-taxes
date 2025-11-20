import type { BrandedNumber } from "../shared/types";
import type { Months, Years, Weeks, Days } from "../shared/types";

export function brand<T>(value: number): BrandedNumber<T> {
  return value as BrandedNumber<T>;
}

export function monthsToYears(months: Months): Years {
  return brand<"years">((months as number) / 12);
}

export function yearsToMonths(years: Years): Months {
  return brand<"months">((years as number) * 12);
}

export function weeksToDays(weeks: Weeks): Days {
  return brand<"days">((weeks as number) * 7);
}

export function daysToWeeks(days: Days): Weeks {
  return brand<"weeks">((days as number) / 7);
}

export function daysToMonths(days: Days): Months {
  return brand<"months">((days as number) / 30);
}
