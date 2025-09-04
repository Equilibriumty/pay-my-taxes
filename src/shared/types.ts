export type BrandedNumber<T> = number & { __brand: T };

export type Months = BrandedNumber<"months">;
export type Years = BrandedNumber<"years">;
export type Weeks = BrandedNumber<"weeks">;
export type Days = BrandedNumber<"days">;

export type Period = Months | Years | Weeks | Days;
