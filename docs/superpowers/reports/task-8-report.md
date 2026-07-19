# Task 8 Report — Query Homepage with Filters, Table, Stats

## Status
DONE

## tsc Result
`npx tsc --noEmit` exited with code 0. No type errors in the created files.

## Commit Hash
3aa87ce

## Files Created
- app/layout.tsx
- app/globals.css
- app/page.tsx

## Concerns
- The homepage links to `/admin/import` and uses a 50-row page size constant for `totalPages` calculation, both hard-coded; the `/admin/import` route does not yet exist (expected by a later task).
- Filter labels use 萬元 (10k) for total price but the API `price_min/max` semantics were not verified against the backend — values are passed through as-is.
- Numeric fields may be null; `fmt()` handles null with "-" but `exportCsv` writes empty string for null, which is acceptable.
