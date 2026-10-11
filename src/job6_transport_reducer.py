#!/usr/bin/env python3
"""Job 6 reducer -> CSV RouteID,Hour,AverageSpeedKmph,ObservationCount,CongestionStatus.

CONGESTED iff exact average < 20 km/h (compared as total < 20 * count, before rounding)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import csv_writer, fmt, groups, sum_values

THRESHOLD_KMPH = 20

out = csv_writer()
for key, values in groups():
    route, _, hour = key.rpartition("|")
    total, count = sum_values(values, 2)
    status = "CONGESTED" if total < THRESHOLD_KMPH * count else "NOT_CONGESTED"
    out.writerow([route, hour, fmt(total / count), count, status])
