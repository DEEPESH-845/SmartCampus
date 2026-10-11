"""Shared helpers for SmartCampusAnalytics streaming scripts.

Kept as one flat module so Hadoop Streaming can ship it with `-files` next to the
mapper/reducer scripts (the task working directory is flat).
"""
import csv
import io
import sys
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from itertools import groupby

TS_FORMAT = "%Y-%m-%d %H:%M"
COUNTER_GROUP = "SmartCampus"

HEADERS = {
    "wifi": ["StudentID", "Timestamp", "AccessPoint", "DataMB", "DurationMin"],
    "canteen": ["TransactionID", "Timestamp", "StudentID", "Item", "Quantity", "Amount"],
    "library": ["StudentID", "Timestamp", "EntryType", "DurationMin"],
    "transport": ["VehicleID", "Timestamp", "RouteID", "SpeedKmph"],
}


class Rejected(ValueError):
    """An input row that fails validation; the message is the counter reason."""


def text(value, name):
    if not value:
        raise Rejected(f"missing_{name}")
    if any(c in value for c in "\t\r\n"):
        raise Rejected(f"control_char_{name}")
    return value


def number(value, name):
    if "_" in value:  # Decimal() would accept "1_000"
        raise Rejected(f"bad_{name}")
    try:
        d = Decimal(value)
    except InvalidOperation:
        raise Rejected(f"bad_{name}")
    if not d.is_finite():
        raise Rejected(f"bad_{name}")
    if d < 0:
        raise Rejected(f"negative_{name}")
    return d


def integer(value, name):
    d = number(value, name)
    if d != d.to_integral_value():
        raise Rejected(f"bad_{name}")
    return int(d)


def hour_bucket(value):
    """'2026-08-10 09:15' -> '2026-08-10-09'. Rejects anything not a real date/time."""
    if len(value) != 16:  # strptime alone would accept unpadded '2026-8-1 9:5'
        raise Rejected("bad_timestamp")
    try:
        return datetime.strptime(value, TS_FORMAT).strftime("%Y-%m-%d-%H")
    except ValueError:
        raise Rejected("bad_timestamp")


def _wifi(r):
    return (text(r[0], "student"), hour_bucket(r[1]), text(r[2], "access_point"),
            number(r[3], "data_mb"), number(r[4], "duration"))


def _canteen(r):
    return (text(r[0], "transaction"), hour_bucket(r[1]), text(r[2], "student"),
            text(r[3], "item"), integer(r[4], "quantity"), number(r[5], "amount"))


def _library(r):
    if r[2] != "ENTRY":
        raise Rejected("bad_entry_type")
    return (text(r[0], "student"), hour_bucket(r[1]), r[2], number(r[3], "duration"))


def _transport(r):
    return (text(r[0], "vehicle"), hour_bucket(r[1]), text(r[2], "route"),
            number(r[3], "speed"))


VALIDATORS = {"wifi": _wifi, "canteen": _canteen, "library": _library, "transport": _transport}


def utf8_stdin():
    # errors="replace": undecodable bytes become U+FFFD and the row is rejected below.
    return io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace", newline="")


def utf8_stdout():
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")


def records(dataset, stream=None):
    """Yield validated tuples from CSV lines on stdin; count every line by outcome.

    Parsing is per line (like Hadoop's TextInputFormat), so a broken quote can only
    damage its own line. Counters go to stderr in Hadoop Streaming counter format.
    """
    header, validate = HEADERS[dataset], VALIDATORS[dataset]
    counts = Counter()
    for line in stream if stream is not None else utf8_stdin():
        line = line.rstrip("\r\n")
        if not line.strip():
            counts["blank_lines"] += 1
            continue
        try:
            row = [f.strip() for f in next(csv.reader([line], strict=True))]
        except csv.Error:
            row = None
        if row and row[0].startswith("﻿"):  # UTF-8 BOM at file start
            row[0] = row[0][1:].strip()
        if row == header:
            counts["header_lines"] += 1
            continue
        counts["records"] += 1
        try:
            if row is None:
                raise Rejected("csv_error")
            if "�" in line:
                raise Rejected("bad_encoding")
            if len(row) != len(header):
                raise Rejected("wrong_field_count")
            rec = validate(row)
        except Rejected as e:
            counts["rejected"] += 1
            counts[f"rejected.{e}"] += 1
            continue
        counts["valid"] += 1
        yield rec
    for name, n in sorted(counts.items()):
        sys.stderr.write(f"reporter:counter:{COUNTER_GROUP},{dataset}.{name},{n}\n")


def groups(stream=None):
    """Group sorted `key<TAB>value` lines by key (everything before the last TAB).

    Yields (key, iterator of value strings). A line without a TAB violates the
    intermediate contract and aborts the task.
    """
    def split(line):
        key, sep, value = line.rstrip("\r\n").rpartition("\t")
        if not sep:
            sys.exit(f"malformed intermediate record: {line!r}")
        return key, value

    lines = stream if stream is not None else utf8_stdin()
    for key, items in groupby(map(split, lines), key=lambda kv: kv[0]):
        yield key, (v for _, v in items)


def decimals(value, n):
    """Parse an intermediate value of exactly n comma-separated decimals."""
    parts = value.split(",")
    if len(parts) != n:
        sys.exit(f"malformed intermediate value: {value!r}")
    try:
        return [Decimal(p) for p in parts]
    except InvalidOperation:
        sys.exit(f"malformed intermediate value: {value!r}")


def sum_values(values, n):
    totals = [Decimal(0)] * n
    for v in values:
        totals = [t + x for t, x in zip(totals, decimals(v, n))]
    return totals


def fmt(d):
    return f"{d:.2f}"


def csv_writer():
    utf8_stdout()
    return csv.writer(sys.stdout, lineterminator="\n")
