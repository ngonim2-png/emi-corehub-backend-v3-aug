/**
 * Money is never handled as a JavaScript float in this codebase.
 * Database columns are NUMERIC(18,2); application code treats amounts as
 * integer minor units (e.g. cents / leones-minor-unit) converted at the
 * API boundary, so arithmetic never touches floating point at all.
 */
export class Money {
  private readonly minorUnits: number;

  private constructor(minorUnits: number) {
    if (!Number.isInteger(minorUnits)) {
      throw new Error('Money must be constructed from an integer minor-unit amount');
    }
    this.minorUnits = minorUnits;
  }

  static fromMajor(amount: number | string): Money {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Money(Math.round(value * 100));
  }

  static fromMinor(amount: number): Money {
    return new Money(amount);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.minorUnits + other.minorUnits);
  }

  subtract(other: Money): Money {
    return new Money(this.minorUnits - other.minorUnits);
  }

  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  greaterThan(other: Money): boolean {
    return this.minorUnits > other.minorUnits;
  }

  toMajor(): number {
    return this.minorUnits / 100;
  }

  toMinor(): number {
    return this.minorUnits;
  }

  /** For NUMERIC(18,2) column binding via TypeORM's string transformer. */
  toDbString(): string {
    return this.toMajor().toFixed(2);
  }
}
