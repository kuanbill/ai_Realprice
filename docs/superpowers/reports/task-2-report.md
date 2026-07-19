# Task 2 Report

## Status: DONE

## tsc output summary
`npx tsc --noEmit` ran. No errors reported in `lib/city-map.ts` or `lib/town-coords.ts`. Other pre-existing errors (missing `next` types / not-yet-created files) are acceptable per task instructions and were not present in the target files.

## Commit hash
`ccfe71e`

## Concerns
- Duplicate values in `CITY_CODES` (t/p both 屏東縣, r/v both 澎湖縣). Functionally harmless for lookups, but worth noting for data hygiene.
- `TOWN_COORDS` only covers a subset of towns/cities; `getTownCoord` will return `null` for unmapped towns (expected behavior).
