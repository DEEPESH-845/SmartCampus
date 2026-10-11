#!/usr/bin/env python3
"""Job 1 mapper: wifi_logs.csv -> "YYYY-MM-DD-HH<TAB>DataMB,DurationMin,1"."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
from mr_common import records, utf8_stdout

utf8_stdout()
for _student, hour, _ap, data_mb, duration in records("wifi"):
    print(f"{hour}\t{data_mb},{duration},1")
