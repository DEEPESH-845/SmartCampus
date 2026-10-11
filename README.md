# SmartCampusAnalytics

Smart Campus Analytics using Python Hadoop Streaming. Six MapReduce jobs analyse four
**synthetic** campus datasets (Wi-Fi, canteen, library, transport). The specification is the lab
worksheet `SmartCampus_MapReduce_Python_Worksheet_Without_Hadoop_sh.docx.pdf`. Requirements and
assumptions are in [PRD.md](PRD.md), the design in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
audit findings in [docs/REVIEW.md](docs/REVIEW.md), and worksheet answers with result
interpretations in [docs/WORKSHEET.md](docs/WORKSHEET.md).

## Prerequisites
Python 3 (only 3.14.6 has been tested; the code avoids features newer than 3.8). No third-party packages. Hadoop is optional and only
needed for cluster execution.

## Repository structure
```
PRD.md  README.md  CLAUDE.md  requirements.txt  .gitignore
data/        wifi_logs.csv canteen.csv library.csv transport.csv README.md (synthetic-data notice)
src/         mr_common.py            shared validation + grouping helpers (shipped with every job)
             job1_wifi_{mapper,reducer}.py      job2_ap_{mapper,reducer}.py
             job3_canteen_{mapper,reducer}.py   job4_stage{1,2}_{mapper,reducer}.py
             job5_{stage1,global,filter}_{mapper,reducer}.py
             job6_transport_{mapper,reducer}.py sum_combiner.py (optional combiner)
scripts/     generate_data.py  run_pipeline.py (local Hadoop Streaming simulator)  reference.py (independent check)
tests/       test_streaming_jobs.py
docs/        ARCHITECTURE.md  REVIEW.md  WORKSHEET.md  SmartCampus_Completed_Worksheet.pdf  Remaining_Tasks_Guide.pdf
screenshots/ 13 execution screenshots (PNG)
outputs/     final CSVs, intermediate/ stage files, validation_report.json
```

## Dataset schemas (header row first, exact field order)
| File | Fields |
|------|--------|
| `wifi_logs.csv` | StudentID, Timestamp (`YYYY-MM-DD HH:MM`), AccessPoint, DataMB, DurationMin |
| `canteen.csv` | TransactionID, Timestamp, StudentID, Item, Quantity (integer), Amount (line total) |
| `library.csv` | StudentID, Timestamp, EntryType (`ENTRY`), DurationMin |
| `transport.csv` | VehicleID, Timestamp, RouteID, SpeedKmph |

## Generate datasets
```bash
python3 scripts/generate_data.py                 # seed 42, writes data/
python3 scripts/generate_data.py --seed 7 --wifi-rows 20000 --out-dir /tmp/campus
python3 scripts/generate_data.py --help          # all size options
```
Default output: 5,005 Wi-Fi, 3,179 canteen lines (1,500 transactions), 1,505 library and 3,568
transport rows. Each file includes 5 deliberately malformed rows. Same arguments give byte-identical files.

## Run all six jobs locally
```bash
python3 scripts/run_pipeline.py                  # exit 0 = ran + all invariants passed
python3 scripts/run_pipeline.py --combiner --map-tasks 4 --reducers 3   # extension-challenge mode
python3 scripts/run_pipeline.py --run-tests      # also records the unittest result in the report
```
Exit codes: 0 success, 1 a mapper/combiner/reducer failed, 2 a validation invariant failed.

## Run one job by hand (worksheet §7 style)
```bash
cat data/wifi_logs.csv | python3 src/job1_wifi_mapper.py                        # inspect key/values
cat data/wifi_logs.csv | python3 src/job1_wifi_mapper.py | LC_ALL=C sort | python3 src/job1_wifi_reducer.py
# Job 4 (two stages)
python3 src/job4_stage1_mapper.py < data/canteen.csv | LC_ALL=C sort | python3 src/job4_stage1_reducer.py \
  | python3 src/job4_stage2_mapper.py | LC_ALL=C sort | python3 src/job4_stage2_reducer.py
# Job 5 (three stages; the global result is passed to the filter as a file)
python3 src/job5_stage1_mapper.py < data/library.csv | LC_ALL=C sort | python3 src/job5_stage1_reducer.py > /tmp/s1.tsv
python3 src/job5_global_mapper.py < /tmp/s1.tsv | LC_ALL=C sort | python3 src/job5_global_reducer.py > /tmp/global.tsv
GLOBAL_STATS=/tmp/global.tsv python3 src/job5_filter_mapper.py < /tmp/s1.tsv | LC_ALL=C sort | python3 src/job5_filter_reducer.py
```
Mappers print rejection counters (`reporter:counter:...`) to stderr. Add `2>/dev/null` to hide them.

## Tests
```bash
python3 -m compileall -q src scripts tests
python3 -m unittest discover -s tests -v         # 36 tests
```

## Outputs (`outputs/`)
| File | Content |
|------|---------|
| `job1_hourly_wifi.csv`, `job1_peak_hours.csv` | hourly totals; top-3 hours by DataMB (rank 1 = peak) |
| `job2_access_points.csv` | per-AP totals, sessions, average session minutes |
| `job3_canteen_items.csv` | per-item quantity and revenue |
| `job4_pairs.csv`, `job4_top_pairs.csv` | every co-purchased pair with transaction count; top 10 |
| `job5_overall.csv`, `job5_anomalies.csv` | overall visit-weighted average; flagged students |
| `job6_route_hour_speed.csv` | route-hour average speed and CONGESTED/NOT_CONGESTED |
| `intermediate/*.tsv` | Job 4 stage-1 pairs, Job 5 per-student totals and global line |
| `validation_report.json` | row counts, valid/rejected counters, invariant results, reference mismatches |

## How the local runner simulates Hadoop Streaming
For each stage, `run_pipeline.py` does the following:
1. Splits the input into `--map-tasks` line chunks.
2. Runs the **real** mapper script on each chunk as a subprocess, plus the combiner if `--combiner` is set.
3. Partitions records by CRC32 of the first key field (the text before the first TAB or `|`) across `--reducers` partitions.
4. Sorts each partition bytewise.
5. Runs the real reducer script once per partition and concatenates the results.

Multi-stage jobs persist stage output to `outputs/intermediate/` and feed it to the next stage.
A non-zero exit from any script stops the pipeline. The runner reimplements no job logic. It only
ranks finished outputs (peak hours, top pairs) and checks invariants.

## Deploying on Hadoop Streaming (not verified here; see below)
One command runs all six jobs in Hadoop standalone mode and diffs them against `outputs/`:
```bash
python3 scripts/run_pipeline.py && scripts/run_hadoop.sh      # prints jobN MATCH / DIFFERS
```
Step-by-step instructions are in `docs/Remaining_Tasks_Guide.pdf`. The manual equivalent:
Ship `mr_common.py` with every job. Each script adds its own directory to `sys.path`.
```bash
JAR=$HADOOP_HOME/share/hadoop/tools/lib/hadoop-streaming-*.jar
hdfs dfs -mkdir -p /campus/in && hdfs dfs -put data/*.csv /campus/in/
# Job 1 (Job 2, Job 3 and Job 6 follow the same pattern)
hadoop jar $JAR -files src/job1_wifi_mapper.py,src/job1_wifi_reducer.py,src/sum_combiner.py,src/mr_common.py \
  -input /campus/in/wifi_logs.csv -output /campus/out/job1 \
  -mapper "python3 job1_wifi_mapper.py" -combiner "python3 sum_combiner.py" -reducer "python3 job1_wifi_reducer.py"
# Job 6: key "RouteID|Hour" is correct with default settings; these options only add RouteID partitioning
hadoop jar $JAR -D mapreduce.map.output.key.field.separator='|' \
  -D mapreduce.partition.keypartitioner.options=-k1,1 \
  -files src/job6_transport_mapper.py,src/job6_transport_reducer.py,src/sum_combiner.py,src/mr_common.py \
  -input /campus/in/transport.csv -output /campus/out/job6 \
  -mapper "python3 job6_transport_mapper.py" -combiner "python3 sum_combiner.py" -reducer "python3 job6_transport_reducer.py" \
  -partitioner org.apache.hadoop.mapred.lib.KeyFieldBasedPartitioner
# Order matters: generic options (-D, -files) must precede streaming options (-mapper, -partitioner, ...)
# Job 4: stage 1 -> /campus/out/job4s1, then stage 2 with -input /campus/out/job4s1
# Job 5: stage1 -> /campus/out/job5s1; global (-D mapreduce.job.reduces=1) -> /campus/out/job5g;
#        filter with -files ...,hdfs:///campus/out/job5g/part-00000#global_stats.txt -input /campus/out/job5s1
hdfs dfs -cat /campus/out/job1/part-* | sort
```

## Verification status
| Status | What |
|--------|------|
| **A. Verified locally** | All six jobs and every stage. 36 unit/integration tests, including reducers run under Hadoop-style key-only sorting. Every output row matches an independent reference implementation. Identical results with and without the combiner, and with 1/3/4 map tasks and 1/3/4 reducers. Failure propagation. Reproducible generator. 1M-row Job 1 benchmark. |
| **B. Verified on Hadoop** | **Hadoop 3.5.0, standalone mode (LocalJobRunner), OpenJDK 17, macOS, 11 Oct 2026.** `scripts/run_hadoop.sh` ran all nine stages, and all six final outputs are identical to the local outputs. Confirmed along the way: `-files` imports of `mr_common.py`, the combiner (Job 1: 5,000 → 112 records), the Job 6 KeyFieldBasedPartitioner options, the Job 5 distributed-cache `#global_stats.txt` file, and the SmartCampus rejection counters in Hadoop's counter report. Hadoop **does** append a trailing TAB to final CSV lines (F6). The script strips it when comparing. |
| **C. Not yet verified** | A multi-node cluster or pseudo-distributed HDFS/YARN setup (standalone mode uses one JVM and the local filesystem), more than one reducer on real Hadoop, and the manual HDFS commands above. |

## Submission material
- `docs/SmartCampus_Completed_Worksheet.pdf`: answers to Q1-Q15, the expected output table, a result
  interpretation for every job, the performance paragraph, answers to all viva questions, and the
  execution screenshots. Submitted by Deepesh Kakkar (roll no. 102315286), 11 October 2026.
- `screenshots/`: 13 real Terminal screenshots captured on 11 Oct 2026, covering data generation,
  the mapper and reducer, the pipeline, the tests, each job's output, the Hadoop run, the Hadoop
  part file and the Hadoop counters.
- `docs/Remaining_Tasks_Guide.pdf`: guide for the remaining submission and viva steps.

## Known limitations
- Synthetic data only. Results describe the generator's patterns, not a real campus.
- Records are line-based. A quoted CSV field containing a newline is rejected.
- The local runner sorts in memory (fine for ~10^6 rows). It is not a performance model of a cluster.
- Job 4 stage 1 keeps one transaction's distinct items in memory.
- Congestion is an average-speed indicator (< 20 km/h), not proof of traffic congestion.
