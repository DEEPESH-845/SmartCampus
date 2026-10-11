#!/usr/bin/env python3
"""Job 4 stage 1 reducer: per transaction emit each unordered distinct pair once.

Output: JSON key ["ItemA","ItemB"] with ItemA < ItemB, then "<TAB>1". JSON makes item names
containing commas or quotes unambiguous. Memory: the distinct items of ONE transaction
(n items -> n*(n-1)/2 pairs, generated lazily)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
import json
from itertools import combinations

from mr_common import groups, utf8_stdout

utf8_stdout()
for _tid, items in groups():
    for pair in combinations(sorted(set(items)), 2):
        print(f"{json.dumps(pair)}\t1")
