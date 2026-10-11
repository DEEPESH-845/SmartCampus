#!/usr/bin/env python3
"""Job 4 stage 2 reducer -> CSV ItemA,ItemB,TransactionCount."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
import json

from mr_common import csv_writer, groups, sum_values

out = csv_writer()
for key, values in groups():
    (count,) = sum_values(values, 1)
    out.writerow([*json.loads(key), count])
