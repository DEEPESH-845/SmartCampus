# Architecture

## Data flow
```
data/*.csv ──► mapper ──► [combiner] ──► partition(first key field) ──► sort ──► reducer ──► outputs/
                                                                    (multi-stage jobs) └─► outputs/intermediate/*.tsv ──► next stage
outputs/job4_pairs.csv ──► Job 7 mapper (+ side file outputs/job3_canteen_items.csv) ──► outputs/   (map-only)
```
| Job | Stages | Input |
|-----|--------|-------|
| 1 Peak Wi-Fi | 1 | wifi_logs.csv |
| 2 Access points | 1 | wifi_logs.csv |
| 3 Canteen items | 1 | canteen.csv |
| 4 Co-purchase | 2: pairs per transaction → pair counts | canteen.csv |
| 5 Library anomaly | 3: per student → global → filter | library.csv |
| 6 Transport | 1 | transport.csv |
| 7 Revenue pairs (extension) | 1, map-only (zero reducers) | Job 4 output + Job 3 output as a side file |

## Key/value contracts
The grouping key is **everything before the last TAB**, and the value is everything after it.
Validated input text never contains a TAB (`control_char_*` rejection), so this split is
unambiguous.

| Stage | Key | Value |
|-------|-----|-------|
| J1 map | `2026-08-10-09` | `DataMB,DurationMin,1` |
| J2 map | `AP03` | `DataMB,DurationMin,1` |
| J3 map | `Sandwich` (may contain `,` or `"`) | `Quantity,Amount` |
| J4 S1 map | `T1001` | `Item` |
| J4 S1 reduce / S2 map | `["Coffee", "Sandwich"]` (JSON, A < B) | `1` |
| J5 S1 map | `S101` | `DurationMin,1` |
| J5 S1 reduce / global map input | `S101` | `TotalDuration,Visits` |
| J5 global map | `GLOBAL` | `TotalDuration,Visits` |
| J5 global reduce | `GLOBAL` | `TotalDuration,Visits,Average\|UNDEFINED` |
| J5 filter map | `S101` | `Total,Visits,GlobalTotal,GlobalVisits` (anomalies only) |
| J6 map | `R04\|2026-08-10-08` (composite, one field) | `SpeedKmph,1` |
| J7 map (final, no reduce) | CSV `ItemA,ItemB,Count,UnitPriceA,UnitPriceB,EstPairRevenue` | (map-only) |

The value always carries a count (`,1`) so that averages are computed from **sum and count**.
That makes `src/sum_combiner.py`, an element-wise sum that emits the same format it reads, safe
for J1, J2, J3, J4 S2, J5 S1 and J6, however many times Hadoop invokes it, including zero.
The combiner is not used for J4 S1 (pair generation needs the whole transaction), J5 global
(trivial input), or the J5 filter (not additive).

## Reducer grouping
Hadoop Streaming delivers one `key<TAB>value` line per record, sorted by key. It does **not**
concatenate the values for a key. `mr_common.groups()` runs `itertools.groupby` over the
stdin lines to detect key boundaries. The worksheet's reference reducer instead split one line
on `;`. On real sorted input that produced a single line for the whole dataset (the last
session only). See REVIEW.md F1.

## Job 4 grouping strategy
Stage 1 keys by TransactionID, so the shuffle brings every line of a transaction to one reducer
call, whatever the order of the input file. The reducer builds `sorted(set(items))` and emits
`itertools.combinations(…, 2)`. This removes duplicate lines, rules out self-pairs, and keeps a
canonical A < B order (n distinct items give n(n-1)/2 pairs). Memory is O(distinct items in one
transaction). A pathological transaction with 10^5 distinct items would emit about 5·10^9 pairs.
That is bounded by output volume, not by lost data. JSON keys make item names containing commas
or quotes unambiguous (the worksheet's "structured serialization" extension).

## Job 5 global-average propagation
Hadoop jobs share no memory, so the global result is passed as **data**:
1. Stage 1 writes `StudentID<TAB>Total,Visits`.
2. Global stage: every record goes to key `GLOBAL`. A single reducer sums them and writes one
   line, and still writes it on empty input, with `UNDEFINED`. Summing student totals equals
   summing the visits themselves, so the average is visit-weighted.
3. The filter stage reads that line from a file. Locally the runner sets
   `GLOBAL_STATS=outputs/intermediate/job5_global.tsv`. On Hadoop you ship
   `-files hdfs:///…/job5g/part-00000#global_stats.txt`, the mapper's default path. Every filter
   task therefore reads the identical global value.
4. Anomaly test, exact in Decimal: `2·total·G_visits > 3·G_total·visits`, which is equivalent to
   `avg > 1.5·overall`. It is strict, so a student exactly at the threshold is not flagged.

## Job 7 map-only join (extension: chain Job 3 and Job 4)
Job 7 joins two finished outputs on the map side. Its input is the Job 4 output
(`ItemA,ItemB,TransactionCount`); the Job 3 output (`Item,TotalQuantity,TotalRevenue`) is a side
file, from `ITEM_STATS` locally or `-files …/job3/part-00000#item_stats.txt` on Hadoop. Each pair
is independent, so the job has **zero reducers** (`-reducer NONE`; locally `run_stage(…, None)`
skips partition, sort and reduce). Score: `EstPairRevenue = count × (UnitPriceA + UnitPriceB)`,
with `UnitPrice = TotalRevenue / TotalQuantity` in Decimal. The mapper skips header lines and
strips Hadoop's trailing TAB from both inputs, and exits non-zero if a pair names an item missing
from the side file.

## Job 6 composite key and partitioning (worksheet Q13)
The key is `RouteID|Hour`, a **single** streaming field. Hadoop's default key (text before the
first TAB) is therefore the whole composite, and grouping is correct with no extra configuration.
The reducer splits on the last `|` (the hour never contains one). An earlier design used
`RouteID<TAB>Hour`. Under Hadoop's default that groups by route only and fragments the averages
(REVIEW.md F2). Optional partitioner: `-partitioner …KeyFieldBasedPartitioner
-D mapreduce.map.output.key.field.separator='|' -D mapreduce.partition.keypartitioner.options=-k1,1`
partitions on RouteID only. Each route's hours therefore land on one
reducer in sorted order, and grouping is unaffected because a group never spans partitions. The
local runner mirrors this by partitioning on the text before the first `|` or TAB. Skew: on a campus with a few
very busy routes, those reducers get more records. Partitioning on the full key would spread load
better. Correctness is the same either way: tests and runs with 1, 3 and 4 reducers give
identical output.

## Validation and error handling
- `mr_common.records()` parses **one line at a time** with `csv.reader(strict=True)`, as Hadoop's
  TextInputFormat delivers lines. An unbalanced quote rejects only its own line.
- Rules: exact field count, trimmed fields, non-empty text with no TAB/CR/LF, a real
  `YYYY-MM-DD HH:MM` timestamp, finite non-negative decimals, integer Quantity, and EntryType=ENTRY.
- Header lines are skipped wherever they appear (each input split could start with one).
  A BOM is stripped. Undecodable bytes are rejected as `bad_encoding`.
- Each mapper ends by emitting Hadoop counters on stderr, `records`, `valid`, `rejected` and
  `rejected.<reason>`, so `records = valid + rejected`.
- A malformed **intermediate** record is a bug in our own pipeline, so reducers exit non-zero
  instead of skipping it.

## Numeric correctness
All arithmetic uses `decimal.Decimal`, which is exact for decimal inputs, so 0.1 + 0.2 = 0.30.
Outputs are formatted with 2 decimals (half-even). Threshold comparisons (J5, J6) use exact
values, so a 19.996 km/h average shows as `20.00` but is still CONGESTED.

## Performance
Mappers and reducers stream with O(1) state per key, except J4 S1 (one transaction). Measured
locally with 1,000,000 Wi-Fi rows on Job 1 and 4 map tasks: about 6.0 s without the combiner and
5.9 s with it, identical output. In one map task the combiner cut shuffle records from 249,981 to
119 (6.2 MB to 4 KB). The local runtime doesn't change because the simulator has no network.
On a cluster, that shuffle reduction is the benefit.

## Results dashboard
`dashboard/` is a Next.js 16 App Router site exported as static HTML (`output: "export"`). At
build time `lib/data.ts` reads `outputs/*.csv`, `outputs/validation_report.json`,
`outputs/intermediate/job5_student_totals.tsv` and the scripts in `src/`. Nothing is fetched at
runtime, so the site cannot disagree with the pipeline run it was built from. Headline numbers are
derived once in `lib/insights.ts`. Heatmaps and bar lists are server-rendered HTML coloured by CSS
variables; only the two scatter charts (Recharts), sortable tables, tooltips and the theme toggle
run in the browser. Vercel builds it with Root Directory `dashboard` and the Next.js preset.
