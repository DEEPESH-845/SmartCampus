#!/usr/bin/env python3
"""Job 5 global reducer -> one line "GLOBAL<TAB>TotalDuration,Visits,Average".

Always emits exactly one line, even for empty input, where Average is UNDEFINED.
Run with a single reducer (there is only one key)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import groups, sum_values, utf8_stdout

utf8_stdout()
total = visits = 0
for _key, values in groups():
    total, visits = sum_values(values, 2)
avg = total / visits if visits else "UNDEFINED"
print(f"GLOBAL\t{total},{visits},{avg}")
