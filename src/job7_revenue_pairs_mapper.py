#!/usr/bin/env python3
"""Job 7 (extension: chain Job 3 -> Job 4) map-only mapper: rank co-purchased pairs by revenue.

Input: Job 4 output lines `ItemA,ItemB,TransactionCount`. Job 3 output (`Item,TotalQuantity,
TotalRevenue`) arrives as a side file (map-side join): path from env ITEM_STATS (default
./item_stats.txt, i.e. the Hadoop distributed-cache symlink created by
`-files <job3 part file>#item_stats.txt`). Zero reducers: each pair is independent.

Output CSV: ItemA,ItemB,TransactionCount,UnitPriceA,UnitPriceB,EstPairRevenue where
UnitPrice = TotalRevenue / TotalQuantity and EstPairRevenue = count * (UnitPriceA + UnitPriceB),
i.e. the revenue of the pair's transactions at one unit of each item at its average price."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Hadoop: works via -files symlinks
import csv

from mr_common import csv_writer, decimals, fmt, utf8_stdin

HEADERS = (["Item", "TotalQuantity", "TotalRevenue"], ["ItemA", "ItemB", "TransactionCount"])


def rows(lines, name):
    """Parse CSV lines (Hadoop appends a trailing TAB to output lines; item names never hold TABs)."""
    for line in lines:
        line = line.rstrip("\t\r\n")
        if not line:
            continue
        row = next(csv.reader([line]))
        if row in HEADERS:
            continue
        if len(row) != 3:
            sys.exit(f"malformed {name} record: {line!r}")
        yield row


path = os.environ.get("ITEM_STATS", "item_stats.txt")
with open(path, encoding="utf-8", newline="") as f:
    price = {}
    for item, qty, revenue in rows(f, "Job 3"):
        qty, revenue = decimals(f"{qty},{revenue}", 2)
        price[item] = revenue / qty if qty else 0

out = csv_writer()
for a, b, count in rows(utf8_stdin(), "Job 4"):
    if a not in price or b not in price:
        sys.exit(f"pair ({a}, {b}) has an item missing from {path}")
    (n,) = decimals(count, 1)
    out.writerow([a, b, n, fmt(price[a]), fmt(price[b]), fmt(n * (price[a] + price[b]))])
