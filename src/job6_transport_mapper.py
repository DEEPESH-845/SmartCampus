#!/usr/bin/env python3
"""Job 6 mapper: transport.csv -> "RouteID|YYYY-MM-DD-HH<TAB>SpeedKmph,1".

The composite key is ONE streaming field, so Hadoop's default (key = text before the first TAB)
groups by route AND hour with no extra configuration. The hour never contains "|", so the
reducer splits on the last "|". Optional: partition by RouteID with KeyFieldBasedPartitioner
(see docs/ARCHITECTURE.md)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import records, utf8_stdout

utf8_stdout()
for _vehicle, hour, route, speed in records("transport"):
    print(f"{route}|{hour}\t{speed},1")
