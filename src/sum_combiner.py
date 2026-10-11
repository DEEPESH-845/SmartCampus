#!/usr/bin/env python3
"""Optional combiner for jobs 1, 2, 3, 4-stage-2, 5-stage-1 and 6.

Emits the same "key<TAB>v1,v2,..." format it reads, with values summed element-wise.
Sum of sums is associative, so running it 0, 1 or many times gives the same final result."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import groups, sum_values, utf8_stdout

utf8_stdout()
for key, values in groups():
    first = next(values)
    totals = sum_values([first, *values], first.count(",") + 1)
    print(f"{key}\t" + ",".join(str(t) for t in totals))
