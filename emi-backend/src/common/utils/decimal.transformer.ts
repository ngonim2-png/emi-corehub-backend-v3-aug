import { ValueTransformer } from 'typeorm';

/**
 * Attach to every NUMERIC(18,2) column: `@Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })`
 * pg returns NUMERIC as a string by default; without this transformer some
 * ORM paths silently coerce it to a JS number and reintroduce float error.
 */
export const DecimalTransformer: ValueTransformer = {
  to: (value?: string | number) => value,
  from: (value?: string) => value,
};
