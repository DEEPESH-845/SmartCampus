# CLAUDE.md — SmartCampusAnalytics

Academic MapReduce project: six Hadoop-Streaming-compatible Python jobs over four synthetic CSV
datasets. The worksheet PDF in the repo root is the spec. PRD.md lists requirements and assumptions.

## Commands
```bash
python3 -m compileall -q src scripts tests
python3 scripts/generate_data.py            # seed 42 -> data/
python3 scripts/run_pipeline.py             # exit 0 ok, 1 script failure, 2 invariant failure
python3 scripts/run_pipeline.py --combiner --map-tasks 4 --reducers 3
python3 -m unittest discover -s tests -v
scripts/run_hadoop.sh                       # real Hadoop Streaming run + diff vs outputs/
```

## Rules
- Standard library only. No frameworks, databases, Docker or services.
- Mapper: CSV on stdin → `key<TAB>value` on stdout via `mr_common.records()`. Never split CSV on commas.
- Reducer: sorted lines on stdin, grouped with `mr_common.groups()` (key = text before the last TAB).
  Never assume values arrive pre-concatenated.
- Every mapper value carries a count so that averages come from sum and count (combiner-safe).
- `Decimal` for all numbers. Compare thresholds exactly, never on rounded output.
- Bad input rows: reject and count. Bad intermediate records: exit non-zero.
- `src/` must stay flat (Hadoop `-files` ships into a flat working directory).
- `scripts/reference.py` must stay independent of `src/`. Don't import job code into it.
- Keep docs in sync with the actual commands and paths.

## Before claiming done
Run compileall, the pipeline (expect all `[PASS]`), and the full test suite. Report counts
honestly. Never describe the local simulation as Hadoop cluster execution.
