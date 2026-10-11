#!/usr/bin/env python3
"""Job 4 stage 1 mapper: canteen.csv -> "TransactionID<TAB>Item".

The shuffle brings all lines of a transaction to one reducer call, so input order and
adjacency in the CSV do not matter."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import records, utf8_stdout

utf8_stdout()
for tid, _hour, _student, item, _quantity, _amount in records("canteen"):
    print(f"{tid}\t{item}")
