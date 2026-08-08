/**
 * Inline test fixture. Kept in sync with examples/events.example.yaml —
 * the source-of-truth for the docs and the CLI. Duplicated here because
 * the vitest-pool-workers runtime is workerd (no filesystem access), so
 * `readFileSync` on the example file would fail in tests.
 *
 * If you edit examples/events.example.yaml, update this string too.
 */
export const EXAMPLE_YAML = `calendar: umm_al_qura

occurrence_range:
  years_back: 3
  years_forward: 6

events:
  - name: "Layla's Hijri Birthday"
    hijri_day: 7
    hijri_month: 10
    hijri_year: 1406
    reminder_days_before: [1, 7]

  - name: "Family Anniversary"
    hijri_day: 5
    hijri_month: 12
    reminder_days_before: []
`;
