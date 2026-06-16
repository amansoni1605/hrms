/**
 * lib/taxEngines/bracket.ts
 *
 * Isolated here to break the circular dependency between index.ts (which
 * re-exports each country engine) and every country engine (which needs
 * computeBracketTax). Both sides can import from this file safely.
 */

export interface TaxBracket {
  upTo:      number;   // Income ceiling for this bracket (Infinity for top)
  rate:      number;   // Marginal rate (0.30 = 30%)
  fixedTax?: number;   // Optional flat tax added at the top of the bracket
}

export function computeBracketTax(
  taxableIncome: number,
  brackets:      TaxBracket[],
): {
  total:      number;
  perBracket: Array<{ upTo: number; rate: number; taxOnBracket: number }>;
} {
  let remaining = taxableIncome;
  let lastCap   = 0;
  let total     = 0;
  const perBracket: Array<{ upTo: number; rate: number; taxOnBracket: number }> = [];

  for (const b of brackets) {
    if (remaining <= 0) break;
    const bracketWidth  = b.upTo === Infinity ? remaining : Math.min(b.upTo - lastCap, remaining);
    const taxOnBracket  = Math.max(0, bracketWidth) * b.rate + (b.fixedTax ?? 0);
    total      += taxOnBracket;
    remaining  -= bracketWidth;
    lastCap     = b.upTo;
    perBracket.push({ upTo: b.upTo, rate: b.rate, taxOnBracket });
  }
  return { total: Math.round(total), perBracket };
}
