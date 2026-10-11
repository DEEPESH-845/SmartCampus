# Independent Review — SmartCampusAnalytics

Conducted after the first complete implementation passed its initial 33 tests. The worksheet was
re-read, the code was examined against Hadoop Streaming's real semantics (not the local runner's),
and the tests were checked by mutation. Severity: Critical / High / Medium / Low.

## Findings

| ID | Sev | Area | Finding | Resolution |
|----|-----|------|---------|------------|
| F1 | Critical | Worksheet reference (C) | The reference `WifiPeakReducer` expects all values for a key on one line joined by `;`, and resets its totals on every line. Neither `sort` nor Hadoop produces that format. Run on real sorted mapper output from `data/wifi_logs.csv`, it printed **one line for the whole dataset**, `2026-08-16-22 TotalDataMB=97.50 … Sessions=1` (the last session only), against 112 correct hourly rows. | Not copied. `mr_common.groups()` detects key boundaries in sorted single-record lines. Regression test `test_reducer_groups_separate_sorted_lines`. |
| F2 | High | Streaming compatibility (C) | The Job 6 composite key was `RouteID<TAB>Hour`. Hadoop's default key is the text before the first TAB, so only RouteID would be the key, and hours of a route would arrive interleaved. The reducer would emit fragmented, wrong averages and statuses unless the user remembered `-D stream.num.map.output.key.fields=2`. The local runner sorted whole lines, which **hid** this. Demonstrated: under key-only sort, `R01 2026-08-10-07` split into partial rows (count 1, avg 17.20 CONGESTED) instead of count 6, avg 23.68. | Key changed to the single field `RouteID\|Hour`, correct under default settings. New test class `HadoopKeySemantics` runs every reducer on a key-only, value-shuffled sort and compares with the local result. It was confirmed to fail on the old design. |
| F3 | Medium | Data integrity (E) | `Decimal()` accepts `1_000` and `strptime` accepts unpadded `2026-8-1 9:5`. Both are outside the documented format. | Rejected (`bad_<field>`, `bad_timestamp`). Test `test_underscore_numbers_and_unpadded_timestamps_rejected`. |
| F4 | Medium | Algorithm (B) | The Job 5 filter reducer "summed" its 4-value records, so a duplicated student line would have doubled the global totals used in its output columns. | Now requires exactly one record per student, otherwise it exits non-zero. Test added. |
| F5 | Medium | Validation report (N) | The invariant "J6 status agrees with average" accepted any status when the displayed average was exactly 20.0, a loophole wider than needed. | Now skips only rows displayed as `20.00`, where display rounding makes the check undecidable. The exact check is done by the independent reference on every row. |
| F6 | Medium | Hadoop claims (N) | Final reducers print CSV lines without a TAB. Hadoop Streaming's TextOutputFormat is widely reported to append a trailing TAB to such lines. **Confirmed on Hadoop 3.5.0** (11 Oct 2026). | Harmless to the data. `run_hadoop.sh` strips it when comparing. To merge results, run `cat part-* \| sed 's/\t$//'`. |
| F7 | Medium | Hadoop config (K) | The Job 5 global stage must use exactly one reducer. With more, the empty reducers each print `GLOBAL 0,0,UNDEFINED`, and the filter could be pointed at the wrong part file and silently flag no one. | The local runner forces 1 reducer. The README Hadoop instructions specify `-D mapreduce.job.reduces=1`. Not enforceable from inside a streaming script. |
| F8 | Low | Memory (J) | Job 4 stage 1 holds the distinct items of one transaction, and pair output grows quadratically with basket size. | Accepted for this domain (baskets ≤ 5 items). Documented in ARCHITECTURE.md. |
| F9 | Low | Interpretation (O) | Job 5 flags a student from a single long visit (S157: one 98-minute visit). This is correct per the spec but weak evidence. | Kept to the spec and noted in the interpretation. A minimum visit count is suggested as a refinement. |
| F11 | High | Execution (K) | Found on the first real Hadoop run: `run_hadoop.sh` placed `-combiner` before `-files`. Hadoop parses generic options (`-D`, `-files`) only before streaming options, so it failed with `Unrecognized option: -files`. The README's manual Job 6 command had the same order. The test stub did not enforce ordering, so it missed this. | Fixed: `-D` options go first, streaming options go last. README corrected. |
| F12 | Medium | Execution (K) | Hadoop turns `-files` paths into URIs. The repository path contains spaces (`Big Data project`), so it failed with `URISyntaxException: Illegal character in path`. | Fixed: the script copies `src/` and `data/` into a space-free staging folder and refuses output paths containing spaces. |
| F10 | Low | Runner | Peak-hour and top-pair ranking use `float` on 2-decimal strings. That is exact enough for these magnitudes, and ties are compared on identical strings. | Accepted. Tie-break is tested. |

## Areas checked with no defect found
- **A Spec compliance:** all 6 jobs, the required multi-stage designs for J4 and J5, and the
  extension challenges (combiner, top-3 hours, partitioner, JSON serialization in J4, malformed
  record counting, combiner comparison, multiple reducers) are implemented.
- **D CSV safety:** quoted commas and escaped quotes are tested end to end (J3, J4). An
  unbalanced quote rejects only its own line.
- **F Numeric:** `Decimal` throughout. 0.1 + 0.2 = 0.30 is tested. Thresholds are compared
  exactly (19.996 → CONGESTED while displayed as 20.00).
- **G Empty inputs:** empty, header-only and blank-line inputs give no rows. J5 gives `UNDEFINED`
  with no anomalies.
- **H Boundaries:** J5 exactly at 1.5× is not flagged. J6 exactly 20 is not congested. J1 ties go
  to the earliest hour.
- **I Duplicates:** duplicate item lines don't inflate J4 counts.
- **K Execution safety:** a failing mapper or reducer raises `StageError`, and the runner exits 1.
- **L Reproducibility:** the generator is byte-identical for the same arguments. Pipeline outputs
  are byte-identical across runs, with and without the combiner, and with 1–4 map tasks and
  1–4 reducers.

## Test-strength check (mutation testing)
Each mutation was applied, the full suite run, and the mutation reverted.

| Mutation | Result |
|----------|--------|
| J5 `>` → `>=` | caught (2 failures) |
| J6 `<` → `<=` | caught |
| J4 drop `set()` dedup | caught |
| J3 revenue `Amount × Quantity` | caught |
| allow negative numbers | caught |
| J1 sessions hard-coded to 1 | caught |
| J6 TAB composite key (F2) | caught by `HadoopKeySemantics` |

One reviewer error worth recording: the first J5 mutation run edited a docstring instead of the
code, and the suite passed. Re-running the mutation on the actual code line was caught.

## Unresolved risks
- Verified on Hadoop 3.5.0 in standalone mode only. Not yet run on a multi-node cluster or with more than one reducer on real Hadoop (F7 still relies on `-D mapreduce.job.reduces=1`).
- Results reflect synthetic generator patterns only.
