# PRD — SmartCampusAnalytics

Smart Campus Analytics using Python Hadoop Streaming. Source of truth:
`SmartCampus_MapReduce_Python_Worksheet_Without_Hadoop_sh.docx.pdf` (the "worksheet").

## 1. Overview
A set of Python 3 mapper/reducer scripts, compatible with Hadoop Streaming, that analyse four
**synthetic** campus datasets (Wi-Fi, canteen, library, transport) with six MapReduce jobs. A local
runner simulates map → sort/shuffle → reduce so the whole application can be executed and tested
without a cluster.

## 2. Problem statement
The university wants operational insight from campus activity logs (worksheet §2): peak network
load, access-point utilisation, canteen demand, co-purchase patterns, unusual library usage, and
transport congestion.

## 3. Goals
- G1. Implement all six worksheet jobs (§4) as stdin/stdout streaming scripts.
- G2. Correct, deterministic, independently verified results.
- G3. Reproducible synthetic datasets (seeded).
- G4. Explicit, documented key/value and intermediate contracts for every stage.
- G5. Answer the worksheet's questions and submission requirements (§8, §13).

## 4. Non-goals
Production deployment, real student data, databases, web UI/APIs, Docker, cloud infrastructure,
ML, Hadoop cluster provisioning, Java custom partitioners/combiners classes, performance SLAs.

## 5. Users and use cases
- Students: study mapper/reducer design, composite keys, job chaining; answer viva questions.
- Instructor: run one command, inspect outputs, check correctness against independent reference.

## 6. Functional requirements
| ID | Requirement |
|----|-------------|
| FR1 | Job 1: per hour (`YYYY-MM-DD-HH`) total DataMB, total DurationMin, sessions; identify peak hour by total DataMB. |
| FR2 | Job 2: per access point total DataMB, total DurationMin, sessions, average session duration. |
| FR3 | Job 3: per item total quantity and total revenue. |
| FR4 | Job 4: two stages; count transactions containing each unordered pair of distinct items. |
| FR5 | Job 5: three stages; per-student and overall visit-weighted average; flag students with average **>** 1.5 × overall. |
| FR6 | Job 6: per route-hour average speed and observation count; congested iff average **<** 20 km/h. |
| FR7 | Generator with seed and size options; byte-identical output for identical arguments. |
| FR8 | Local runner that executes the real scripts as subprocesses, sorts between stages, stops with non-zero exit on any failure, writes outputs and a JSON validation report. |
| FR9 | Malformed records are rejected and counted by reason (worksheet extension challenge). |
| FR10 | Optional combiner and multi-reducer simulation (worksheet extension challenges). |

## 7. Dataset specifications (exact field order, header row required first)
| File | Fields | Example |
|------|--------|---------|
| `data/wifi_logs.csv` | StudentID, Timestamp, AccessPoint, DataMB, DurationMin | `S101,2026-08-10 09:15,AP03,120,35` |
| `data/canteen.csv` | TransactionID, Timestamp, StudentID, Item, Quantity, Amount | `T1001,2026-08-10 13:05,S101,Sandwich,2,160` |
| `data/library.csv` | StudentID, Timestamp, EntryType, DurationMin | `S101,2026-08-10 10:20,ENTRY,85` |
| `data/transport.csv` | VehicleID, Timestamp, RouteID, SpeedKmph | `BUS07,2026-08-10 08:30,R04,18.5` |

Validation rules (shared by all mappers, `src/mr_common.py`):
- Exactly the schema's field count; fields are whitespace-trimmed.
- Text fields non-empty; no TAB/CR/LF (they would corrupt the streaming key/value format).
- Timestamp exactly `YYYY-MM-DD HH:MM`, a real calendar date/time.
- Numeric fields: finite decimals ≥ 0. `Quantity` must be an integer ≥ 0.
- Library `EntryType` must be `ENTRY` (see assumption A3).
- A row identical to the header is skipped (it can appear at the start of any input split).

## 8. MapReduce job specifications
Intermediate lines are `key<TAB>value`. Keys never contain a TAB (Job 6's composite key uses `|`),
so Hadoop's default key (text before the first TAB) equals our key. Reducers split on the last TAB.

| Job/stage | Mapper input → output | Reducer output |
|-----------|----------------------|----------------|
| J1 | wifi CSV → `YYYY-MM-DD-HH\tDataMB,DurationMin,1` | CSV `Hour,TotalDataMB,TotalDurationMin,Sessions` |
| J2 | wifi CSV → `AccessPoint\tDataMB,DurationMin,1` | CSV `AccessPoint,TotalDataMB,TotalDurationMin,Sessions,AvgSessionDurationMin` |
| J3 | canteen CSV → `Item\tQuantity,Amount` | CSV `Item,TotalQuantity,TotalRevenue` |
| J4 S1 | canteen CSV → `TransactionID\tItem` | `["ItemA","ItemB"]\t1` per distinct pair per transaction (JSON key, A < B) |
| J4 S2 | S1 output → same (validated) | CSV `ItemA,ItemB,TransactionCount` |
| J5 S1 | library CSV → `StudentID\tDurationMin,1` | `StudentID\tTotalDuration,Visits` |
| J5 global | S1 output → `GLOBAL\tTotalDuration,Visits` | `GLOBAL\tTotalDuration,Visits,Average\|UNDEFINED` |
| J5 filter | S1 output + global file → `StudentID\tTotal,Visits` for anomalies only | CSV `StudentID,TotalDurationMin,Visits,AverageDurationMin,OverallAverageMin,ThresholdMin` |
| J6 | transport CSV → `RouteID\|YYYY-MM-DD-HH\tSpeed,1` | CSV `RouteID,Hour,AverageSpeedKmph,ObservationCount,CongestionStatus` |

Peak hour (J1) and top pairs (J4) are rankings of the complete reducer output, written by the
runner as `job1_peak_hours.csv` (top 3) and `job4_top_pairs.csv`. Tie-break: J1 earliest hour wins;
J4 count desc then ItemA, ItemB ascending.

## 9. Input and output contracts
- Mapper: CSV on stdin, `key\tvalue` on stdout, rejection counters on stderr in Hadoop's
  `reporter:counter:SmartCampus,<dataset>.<name>,<n>` format.
- Reducer: key-sorted mapper output on stdin; one aggregated record per key on stdout. Records
  for a key arrive as **separate adjacent lines** (never pre-concatenated).
- Final outputs: UTF-8 CSV with a header added by the runner; rows sorted bytewise.
- Numbers: exact `Decimal` arithmetic; outputs formatted to 2 decimals (half-even).
  Comparisons against thresholds use exact values, not the rounded display.

## 10. Data-quality requirements
Every input line is accounted for: `records = valid + Σ rejected[reason]`; header and blank lines
are counted separately. Rejected rows never contribute to any aggregate.

## 11. Error-handling requirements
- Bad **input** rows: reject, count, continue.
- Bad **intermediate** records (contract violation between our own stages): abort with non-zero exit.
- Runner: any non-zero mapper/combiner/reducer exit stops the pipeline with exit code 1.
- Empty or header-only inputs: no output rows, no exceptions; Job 5 reports average `UNDEFINED`.

## 12. Performance considerations
Mappers/reducers are streaming and O(1) memory per key except J4 S1 (holds the distinct items of
one transaction). The local runner sorts in memory (adequate for ≤ ~10^6 rows; not a cluster
substitute). Combiners are valid for J1, J2, J3, J4 S2, J5 S1, J6 (sum of sums). No throughput
target is specified by the worksheet; benchmark figures are measured, not promised.

## 13. Testing strategy
`unittest`, standard library only. Scripts tested as subprocesses (mapper alone, reducer on
sorted mapper output, full pipeline), hand-computed expectations for small fixtures, and an
**independent reference implementation** (`scripts/reference.py`, different parsing code,
`Fraction` arithmetic) compared against every output row of the generated data.

## 14. Acceptance criteria
- AC1. Generator: same seed+args ⇒ byte-identical files; different seed ⇒ different files.
- AC2. All six jobs run via `python3 scripts/run_pipeline.py` with exit code 0.
- AC3. Every output row of every job matches the independent reference (within 0.005 display rounding).
- AC4. Σ J1 sessions = Σ J2 sessions = valid Wi-Fi rows; Σ DataMB agree likewise.
- AC5. Σ J3 quantity/revenue = valid canteen totals; every J4 pair is canonical (A < B, A ≠ B) and count ≤ #transactions.
- AC6. J5 threshold strict (`>`), exact-boundary student not flagged; empty input ⇒ `UNDEFINED`, no anomalies.
- AC7. J6 status agrees with exact average; exactly 20 ⇒ not congested.
- AC8. Results identical with/without combiner and with 1 vs 3 reducers.
- AC9. Failing mapper/reducer ⇒ runner exit ≠ 0.
- AC10. `python3 -m unittest discover -s tests -v` passes with 0 failures, 0 errors, 0 skips.

## 15. Assumptions and limitations
- A1. `Amount` is the **line total** (worksheet example: 2 × Sandwich = 160, i.e. 80 each). Revenue = Σ Amount; never Quantity × Amount.
- A2. "Hour" in Jobs 1 and 6 means calendar date + hour (`YYYY-MM-DD-HH`) as in the worksheet hint, so the same hour on different dates is a different key.
- A3. The worksheet shows only `EntryType=ENTRY` with a duration; each ENTRY row is one visit. Other types are rejected (`bad_entry_type`) to avoid double counting.
- A4. Job 4 counts a pair once per transaction regardless of duplicate lines or quantities.
- A5. Records are line-oriented (as Hadoop's TextInputFormat delivers them); CSV fields with embedded newlines are not supported and are rejected.
- A6. Transaction consistency (one timestamp/student per TransactionID) is not checked.
- L1. Hadoop execution is **not verified** in this environment (Hadoop not installed).
- L2. Congestion is an average-speed indicator, not proof of traffic congestion.

## 16. Submission requirements (worksheet §13)
Source code ✔, input datasets ✔, completed worksheet (`docs/WORKSHEET.md`) ✔, result interpretation
per job ✔, performance paragraph ✔. Screenshots and viva cannot be produced here; the README lists
the commands to run for screenshots.
