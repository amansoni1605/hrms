import { NextRequest, NextResponse }     from 'next/server';
import { withRoute }                     from '@/lib/withRoute';
import { getTaxEngine, listSupportedTaxCountries } from '@/lib/taxEngines';

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/me/tax            — returns the list of supported countries + their field schemas
// POST /api/me/tax/compute   — POSTs declarations, returns the full breakdown
// ─────────────────────────────────────────────────────────────────────────────

export const GET = withRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get('country');

  if (country) {
    const engine = getTaxEngine(country);
    if (!engine) return NextResponse.json({ error: 'Unsupported country' }, { status: 404 });
    return NextResponse.json({
      data: {
        country:     engine.country,
        displayName: engine.displayName,
        currency:    engine.currency,
        regimes:     engine.regimes,
        fields:      engine.fields,
      },
    });
  }

  // No country param → list all supported countries
  return NextResponse.json({ data: listSupportedTaxCountries() });
});

export const POST = withRoute(async (req) => {
  const body = await req.json() as {
    country:           string;
    grossAnnualIncome: number;
    declarations:      Record<string, number | string | boolean>;
    regime?:           string;
    state?:            string;
    age?:              number;
  };

  if (!body.country) return NextResponse.json({ error: 'country is required' }, { status: 400 });
  if (typeof body.grossAnnualIncome !== 'number' || body.grossAnnualIncome < 0) {
    return NextResponse.json({ error: 'grossAnnualIncome must be a non-negative number' }, { status: 400 });
  }

  const engine = getTaxEngine(body.country);
  if (!engine) {
    return NextResponse.json({ error: `Tax engine not available for "${body.country}"` }, { status: 404 });
  }

  const breakdown = engine.compute({
    grossAnnualIncome: body.grossAnnualIncome,
    declarations:      body.declarations ?? {},
    regime:            body.regime,
    state:             body.state,
    age:               body.age,
  });

  return NextResponse.json({ data: breakdown });
});
