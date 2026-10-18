#!/usr/bin/env bash
# Run all seven SmartCampusAnalytics jobs with real Hadoop Streaming and compare the results
# with the local pipeline's outputs/ (run `python3 scripts/run_pipeline.py` first).
#
# Intended for Hadoop standalone mode (local filesystem, no HDFS needed).
# Usage:   scripts/run_hadoop.sh [OUTPUT_DIR]          (default /tmp/smartcampus_hadoop)
# Env:     HADOOP_STREAMING_JAR=/path/to/hadoop-streaming-X.jar   (auto-detected if unset)
#          PYTHON=/full/path/to/python3   (if Hadoop tasks cannot find python3)
# Exit:    0 all seven jobs match, 1 a job failed or differs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/tmp/smartcampus_hadoop}"
PY="${PYTHON:-python3}"
cd "$ROOT"

command -v hadoop >/dev/null || { echo "hadoop not found on PATH (see the guide, step 1)"; exit 1; }
[ -s outputs/job1_hourly_wifi.csv ] || { echo "run: python3 scripts/run_pipeline.py first"; exit 1; }

JAR="${HADOOP_STREAMING_JAR:-}"
if [ -z "$JAR" ]; then
  for base in "${HADOOP_HOME:-}" "$(brew --prefix hadoop 2>/dev/null || true)/libexec"; do
    found=$(ls "$base"/share/hadoop/tools/lib/hadoop-streaming-*.jar 2>/dev/null | head -1 || true)
    [ -n "$found" ] && JAR="$found" && break
  done
fi
[ -f "$JAR" ] || { echo "hadoop-streaming jar not found; set HADOOP_STREAMING_JAR"; exit 1; }
echo "Using $JAR"

case "$OUT" in *" "*) echo "OUTPUT_DIR must not contain spaces (Hadoop paths are URIs)"; exit 1;; esac
mkdir -p "$OUT/logs"
# Hadoop turns -files/-input paths into URIs, which reject spaces (this repo lives in
# "Big Data project"), so run from a space-free copy of the scripts and data.
STAGE="$OUT/stage"
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -R src data "$STAGE/"

# run NAME INPUT MAPPER REDUCER|NONE [EXTRA_FILE] [HADOOP OPTIONS...]   (NONE = map-only job)
run() {
  local name=$1 input=$2 mapper=$3 reducer=$4 extra=$5; shift 5
  local s="$STAGE/src" reducer_cmd="NONE"
  local files="$s/$mapper,$s/sum_combiner.py,$s/mr_common.py${extra:+,$extra}"
  [ "$reducer" != NONE ] && files="$files,$s/$reducer" && reducer_cmd="$PY $reducer"
  # Hadoop parses generic options (-D, -files) only BEFORE streaming options (-combiner, -partitioner).
  local generic=() streaming=()
  while [ $# -gt 0 ]; do
    if [ "$1" = "-D" ]; then generic+=("$1" "$2"); else streaming+=("$1" "$2"); fi
    shift 2
  done
  rm -rf "$OUT/$name"
  echo "== $name"
  if ! hadoop jar "$JAR" ${generic[@]+"${generic[@]}"} -files "$files" -input "$input" -output "$OUT/$name" \
       -mapper "$PY $mapper" -reducer "$reducer_cmd" ${streaming[@]+"${streaming[@]}"} >"$OUT/logs/$name.log" 2>&1; then
    echo "   FAILED - last lines of $OUT/logs/$name.log:"; tail -20 "$OUT/logs/$name.log"; exit 1
  fi
}

COMB=(-combiner "$PY sum_combiner.py")
run job1   "$STAGE/data/wifi_logs.csv"  job1_wifi_mapper.py      job1_wifi_reducer.py      "" "${COMB[@]}"
run job2   "$STAGE/data/wifi_logs.csv"  job2_ap_mapper.py        job2_ap_reducer.py        "" "${COMB[@]}"
run job3   "$STAGE/data/canteen.csv"    job3_canteen_mapper.py   job3_canteen_reducer.py   "" "${COMB[@]}"
run job4s1 "$STAGE/data/canteen.csv"    job4_stage1_mapper.py    job4_stage1_reducer.py    ""
run job4   "$OUT/job4s1"       job4_stage2_mapper.py    job4_stage2_reducer.py    "" "${COMB[@]}"
run job5s1 "$STAGE/data/library.csv"    job5_stage1_mapper.py    job5_stage1_reducer.py    "" "${COMB[@]}"
run job5g  "$OUT/job5s1"       job5_global_mapper.py    job5_global_reducer.py    "" -D mapreduce.job.reduces=1
run job5   "$OUT/job5s1"       job5_filter_mapper.py    job5_filter_reducer.py    "$OUT/job5g/part-00000#global_stats.txt"
run job6   "$STAGE/data/transport.csv"  job6_transport_mapper.py job6_transport_reducer.py "" \
    -D mapreduce.map.output.key.field.separator='|' -D mapreduce.partition.keypartitioner.options=-k1,1 \
    -partitioner org.apache.hadoop.mapred.lib.KeyFieldBasedPartitioner "${COMB[@]}"
run job7   "$OUT/job4"         job7_revenue_pairs_mapper.py NONE                  "$OUT/job3/part-00000#item_stats.txt"

echo
echo "== Comparison with local outputs/ (trailing TAB stripped)" | tee "$OUT/compare.txt"
status=0
for pair in job1:job1_hourly_wifi.csv job2:job2_access_points.csv job3:job3_canteen_items.csv \
            job4:job4_pairs.csv job5:job5_anomalies.csv job6:job6_route_hour_speed.csv \
            job7:job7_revenue_pairs.csv; do
  job=${pair%%:*} file=${pair#*:}
  if diff <(cat "$OUT/$job"/part-* | sed $'s/\t$//' | LC_ALL=C sort) \
          <(tail -n +2 "outputs/$file" | LC_ALL=C sort) >"$OUT/logs/$job.diff"; then
    echo "$job MATCH ($(wc -l <"outputs/$file" | tr -d ' ') lines incl. header)" | tee -a "$OUT/compare.txt"
  else
    echo "$job DIFFERS - see $OUT/logs/$job.diff" | tee -a "$OUT/compare.txt"; status=1
  fi
done
if grep -q $'\t$' "$OUT"/job1/part-*; then
  echo "Trailing TAB on reducer output lines: YES (review finding F6 confirmed)" | tee -a "$OUT/compare.txt"
else
  echo "Trailing TAB on reducer output lines: NO" | tee -a "$OUT/compare.txt"
fi
grep -h "valid=\|rejected=" "$OUT/logs/job1.log" | head -5 | tee -a "$OUT/compare.txt" || true
echo "Summary saved to $OUT/compare.txt"
exit $status
