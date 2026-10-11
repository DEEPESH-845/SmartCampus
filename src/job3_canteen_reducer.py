#!/usr/bin/env python3
"""Job 3 reducer -> CSV Item,TotalQuantity,TotalRevenue (revenue = sum of line Amounts)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import csv_writer, fmt, groups, sum_values

out = csv_writer()
for item, values in groups():
    quantity, revenue = sum_values(values, 2)
    out.writerow([item, quantity, fmt(revenue)])
