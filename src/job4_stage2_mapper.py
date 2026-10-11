#!/usr/bin/env python3
"""Job 4 stage 2 mapper: validate and pass through "[\"A\",\"B\"]<TAB>count"."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
import json

from mr_common import utf8_stdin, utf8_stdout

utf8_stdout()
for line in utf8_stdin():
    key, sep, count = line.rstrip("\r\n").rpartition("\t")
    try:
        a, b = json.loads(key)
        ok = sep and isinstance(a, str) and isinstance(b, str) and a < b and int(count) > 0
    except (ValueError, TypeError):
        ok = False
    if not ok:
        sys.exit(f"malformed stage-1 record: {line!r}")
    print(f"{key}\t{count}")
