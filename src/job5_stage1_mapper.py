#!/usr/bin/env python3
"""Job 5 stage 1 mapper: library.csv -> "StudentID<TAB>DurationMin,1" (one ENTRY row = one visit)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import records, utf8_stdout

utf8_stdout()
for student, _hour, _entry, duration in records("library"):
    print(f"{student}\t{duration},1")
