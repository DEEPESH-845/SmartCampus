#!/usr/bin/env python3
"""Job 2 reducer -> CSV AccessPoint,TotalDataMB,TotalDurationMin,Sessions,AvgSessionDurationMin."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import csv_writer, fmt, groups, sum_values

out = csv_writer()
for ap, values in groups():
    data_mb, duration, sessions = sum_values(values, 3)
    # sessions >= 1 for every observed group; guard anyway so a bad combiner cannot divide by zero
    avg = duration / sessions if sessions else 0
    out.writerow([ap, fmt(data_mb), fmt(duration), sessions, fmt(avg)])
