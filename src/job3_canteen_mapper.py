#!/usr/bin/env python3
"""Job 3 mapper: canteen.csv -> "Item<TAB>Quantity,Amount". Amount is the line total (PRD A1)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import records, utf8_stdout

utf8_stdout()
for _tid, _hour, _student, item, quantity, amount in records("canteen"):
    print(f"{item}\t{quantity},{amount}")
