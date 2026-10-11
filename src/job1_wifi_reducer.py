#!/usr/bin/env python3
"""Job 1 reducer: hourly totals -> CSV Hour,TotalDataMB,TotalDurationMin,Sessions.

Input is sorted mapper (or combiner) output, one record per line; records for an hour
are adjacent and are summed here (they are never pre-joined by Hadoop)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import csv_writer, fmt, groups, sum_values

out = csv_writer()
for hour, values in groups():
    data_mb, duration, sessions = sum_values(values, 3)
    out.writerow([hour, fmt(data_mb), fmt(duration), sessions])
