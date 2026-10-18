# Completed Worksheet — SmartCampusAnalytics

All numbers below come from the **synthetic** datasets generated with seed 42 (default sizes)
and from `python3 scripts/run_pipeline.py`. They describe the generator's patterns, not a real campus.

## §8 Student implementation questions

**Q1. Job 1 mapper key?** `YYYY-MM-DD-HH` (e.g. `2026-08-10-09`). The shuffle groups records by
key, so the key must be the unit we aggregate over: one calendar hour. Including the date keeps
09:00 on different days separate.

**Q2. Mapper value; a more efficient representation?** `DataMB,DurationMin,1`. The trailing count
lets reducers and combiners add up sessions without a separate job. A more efficient
representation pre-aggregates inside the mapper (in-mapper combining) or uses the combiner
(`src/sum_combiner.py`). Then one `sum,sum,count` record per hour leaves each map task instead of
one per session (measured: 249,981 → 119 records). A binary or Avro encoding would shrink bytes
further.

**Q3. Why the hour, not the full timestamp?** Full timestamps are almost unique, so every group
would hold about one record and nothing would be aggregated. Truncating to the hour gives the
grouping granularity the question asks for.

**Q4. Which operations can use a Combiner?** Associative and commutative ones whose output format
equals the reducer's input format: sums and counts (Jobs 1, 2, 3, 4-stage-2, 5-stage-1, 6).
Averages work only as (sum, count) pairs, never as averages of averages. Not suitable: J4 stage-1
pair generation (needs the whole transaction) and the J5 filter (needs the global average).

**Q5. Job 2 key/value.** Key `AccessPoint`; value `DataMB,DurationMin,1`. The reducer outputs
totals, sessions and TotalDuration / Sessions.

**Q6. Job 4 unique pairs.** Stage 1 keys each line by TransactionID, so the reducer sees one whole
transaction. It takes `sorted(set(items))` and emits `combinations(items, 2)`: every pair once, no
self-pairs, duplicates removed, A < B. Stage 2 sums the 1s per pair.

**Q7. Why sort the pair?** (Coffee, Sandwich) and (Sandwich, Coffee) are the same pair. If both
spellings appeared they would be two different keys, so each would be counted separately and both
undercounted. A canonical order makes them one key.

**Q8. Overall average with more than one job.** Job 5a: per-student (total, visits). Job 5b: map
every record to the single key `GLOBAL`, and one reducer sums total and visits, giving
average = total / visits (visit-weighted). Job 5c: a filter job receives that one line as a side
file (distributed cache) and keeps students whose total / visits > 1.5 × average.

**Q9. Why RouteID and Hour together?** Congestion is a property of one route **at** one time.
Keying by route alone mixes rush hour with midnight. Keying by hour alone mixes all routes. Only
the pair groups the observations we want to average.

**Q10. Which jobs need more than one stage?** Job 4: pairs must be built per transaction before
they can be counted across transactions, which needs two different groupings. Job 5: the filter
needs the global average, which only exists after every record has been seen, so it needs a
per-student, a global and a filter stage. Jobs 1, 2, 3 and 6 are single-grouping aggregations. In
this implementation the Job 1 peak is a ranking of the finished hourly output, and could be a
second single-key stage on a cluster. The extension Job 7 is a third kind of chaining: a map-only
job that consumes the outputs of Jobs 3 and 4.

**Q11. A reducer receives millions of values for one key?** It still works: our reducers stream
values with O(1) memory. But that one reducer becomes the straggler that limits job completion,
and its input is one huge shuffle transfer. Mitigations: a combiner, and for hot keys, salting the
key (key#n) and then a second merge stage.

**Q12. Data skew in this application.** Peak lunch hours, popular access points (library AP), the
top items (Tea, Samosa) and busy routes produce much larger groups than others. With hash
partitioning, the reducers that own these keys run longest. Combiners shrink the problem for the
additive jobs. J4 stage 1 skews if one transaction is very large.

**Q13. Custom partitioner for Job 6.** Use the composite key `RouteID|Hour` with
`KeyFieldBasedPartitioner`, key-field separator `|`, options `-k1,1`. All hours of a route go to one reducer, and its output is sorted by route then
hour, which is convenient for per-route time-series reports. It is correct because a
(route, hour) group never spans partitions. If one route dominates, partition on the full key
(`-k1,2`) instead for better balance. See ARCHITECTURE.md.

**Q14. Malformed records.** Validate every field in the mapper, reject bad rows instead of
crashing, and count them by reason with Hadoop counters. Never let invalid values enter
aggregates. Parse with a real CSV parser, not `split(",")`. This project does all of this
(`mr_common.records`, counters in `validation_report.json`).

**Q15. Another campus analytics problem.** Room occupancy per building-hour from Wi-Fi
associations (distinct students per AP per hour), using a two-stage distinct-count job.

## §9 Expected output worksheet
| Job | Expected key | Expected value | Student result (seed 42) |
|-----|-------------|----------------|--------------------------|
| 1 Peak Wi-Fi | `YYYY-MM-DD-HH` | TotalDataMB, TotalDurationMin, Sessions | 112 hours; peak **2026-08-10 14:00**, 18,491.90 MB, 100 sessions |
| 2 Access point | `AccessPoint` | totals, sessions, average duration | 12 APs, 394–440 sessions each, average 58.0–62.8 min |
| 3 Canteen | `Item` | TotalQuantity, TotalRevenue | 12 items; top revenue Sandwich ₹47,120; most units Tea (651) |
| 4 Co-purchase | `(ItemA, ItemB)` | TransactionCount | 66 pairs; top (Samosa, Tea) 242, (Coffee, Sandwich) 220 |
| 5 Library | `StudentID` (stage 1) / `GLOBAL` | total, visits / overall average | overall 62.38 min over 1,500 visits; threshold 93.57; 6 anomalous students |
| 6 Transport | `RouteID, Hour` | AverageSpeed, count, status | 784 route-hours; 86 CONGESTED |
| 7 Revenue pairs (extension) | `(ItemA, ItemB)` (map-only) | count, unit prices, EstPairRevenue | 66 pairs; top (Coffee, Sandwich) ₹25,300 vs (Samosa, Tea) ₹8,470 |

## Result interpretation (one per job)
1. **Job 1:** Wi-Fi load concentrates in late morning and early afternoon. Summed across days,
   hours 11, 14 and 15 carry the most data. The single busiest hour is 2026-08-10 14:00. Capacity
   planning should target these hours, not the daily average.
2. **Job 2:** Load is fairly even across the 12 APs (sessions within ~12%, data within ~17%), because the
   generator assigns APs uniformly. Real data would show hotspots. The ~60-minute average session
   is a baseline against which to spot unusually short (roaming) or long sessions.
3. **Job 3:** Tea and Samosa sell the most units, but Sandwich earns the most revenue because of
   its higher price. Volume rankings and revenue rankings differ, so stocking and pricing
   decisions need both.
4. **Job 4:** Two combos dominate: Samosa + Tea (242 transactions) and Coffee + Sandwich (220).
   All other pairs appear in at most 39 transactions. These are natural meal-deal candidates. Item
   names with commas and quotes are handled correctly.
5. **Job 5:** 6 of 200 students average more than 93.57 min per visit. Five are the generator's
   planted heavy readers (≈ 200–250 min). One (S157) is flagged from a single 98-minute visit,
   which shows that a one-visit average is weak evidence. A minimum visit count would be a
   sensible refinement. Flags are prompts for review, not conclusions.
6. **Job 6:** Congestion clusters in the rush hours 08–09 and 17–18, and on routes R03 and R02
   (37 and 35 congested route-hours). Average speed below 20 km/h is only an indicator. It does
   not separate traffic from scheduled stops.
7. **Job 7 (extension, Job 3 + Job 4 chained):** Frequency and value rank pairs differently.
   Samosa + Tea is the most frequent pair (242 transactions) but earns about ₹8,470 at average
   prices. Coffee + Sandwich (220 transactions) earns about ₹25,300, roughly 3× more. Pairs with
   Veg Biryani or Masala Dosa are rare (25–36 transactions) but fill places 3–8 on value. A
   meal-deal discount on Coffee + Sandwich protects the most revenue, while one on Samosa + Tea
   mainly drives footfall.

## Performance considerations
The jobs are I/O- and shuffle-bound, not CPU-bound. Every map record is serialised, sorted and
copied over the network before reducing. Shuffle volume is therefore the main lever. Combiners on
the additive jobs reduce Job 1's per-task shuffle from about 250k records to about 120. Compact
values (sum, count) keep averages combinable. Composite keys and partitioners decide how evenly
reducers are loaded, and skewed keys (lunch hours, popular routes, very large transactions) create
stragglers. Job 4's pair generation is quadratic in basket size, so basket size, not row count,
drives its cost. The multi-stage jobs pay extra job start-up and intermediate HDFS writes, so
stages should be added only when a different grouping is genuinely required, as in Jobs 4 and 5.

## Extension challenges (worksheet §12)
All eight are implemented.

| Challenge | Implementation and evidence |
|-----------|-----------------------------|
| Combiner for the Wi-Fi job | `src/sum_combiner.py`, an element-wise sum safe for every additive job. On Hadoop it reduced Job 1's 5,000 map records to 112. |
| Top three hours | `outputs/job1_peak_hours.csv`: 2026-08-10 14:00, 2026-08-13 11:00, 2026-08-11 15:00. |
| Custom partitioner for transport | KeyFieldBasedPartitioner on RouteID (Q13), verified on Hadoop 3.5.0. |
| Structured serialization | Job 4 uses JSON pair keys such as `["Coffee", "Sandwich"]`, so item names with commas or quotes stay unambiguous. |
| Chain Job 3 and Job 4: high-revenue pairs | **Job 7**: a map-only job (`-reducer NONE`). Its input is the Job 4 output; the Job 3 output reaches every mapper as a distributed-cache side file. Score = TransactionCount × (UnitPriceA + UnitPriceB), with UnitPrice = TotalRevenue / TotalQuantity. Top: (Coffee, Sandwich) ₹25,300, (Samosa, Tea) ₹8,470. |
| Count rejected malformed records | 5 malformed rows per dataset (20 in total), rejected by reason and reported as Hadoop counters; records = valid + rejected is checked. |
| With and without a Combiner | Identical outputs. Shuffle records fell from 5,000 to 112 on Hadoop (Job 1), and from 249,981 to 119 per map task in a 1,000,000-row local benchmark. |
| Multiple reducers | Identical outputs with 1, 3 and 4 reducers in the local simulator (Hadoop was run with one reducer). |

## Viva quick answers
Three phases: map, shuffle/sort, reduce. Hadoop sorts mapper output so equal keys arrive adjacent
and one streaming pass can aggregate them. Zero reducers is allowed: a map-only job writes mapper
output directly, as Job 7 does. With multiple reducers each one owns a key partition and output is split across
`part-*` files. Results stay correct because a key never spans reducers, which we verified with 3
and 4 reducers. Data locality means scheduling map tasks on the nodes that hold the input blocks.
Duplicate records: deduplicate with a key on the record's identity. For Job 4, items are already
deduplicated within each transaction.
