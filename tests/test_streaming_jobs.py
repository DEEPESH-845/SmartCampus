"""Tests for SmartCampusAnalytics. Run: python3 -m unittest discover -s tests -v

Scripts are executed as real subprocesses through the local runner's run_stage
(map -> sort -> reduce). Expected values are hand-computed or come from the
independent reference in scripts/reference.py.
"""
import contextlib
import csv
import io
import os
import random
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import generate_data  # noqa: E402
import reference  # noqa: E402
import run_pipeline as rp  # noqa: E402

WIFI = "StudentID,Timestamp,AccessPoint,DataMB,DurationMin\n"
CANTEEN = "TransactionID,Timestamp,StudentID,Item,Quantity,Amount\n"
LIBRARY = "StudentID,Timestamp,EntryType,DurationMin\n"
TRANSPORT = "VehicleID,Timestamp,RouteID,SpeedKmph\n"


def generate(*args):
    with contextlib.redirect_stdout(io.StringIO()):
        generate_data.main(list(args))


def job(mapper, reducer, text, **kw):
    """Run one stage on CSV text; return (parsed output rows, mapper counters)."""
    out, counters = rp.run_stage(mapper, reducer, text.encode(), **kw)
    return list(csv.reader(io.StringIO(out.decode()))), counters


def job5(text, **kw):
    """Run all three Job 5 stages; return (global line, anomaly rows)."""
    s1, _ = rp.run_stage("job5_stage1_mapper.py", "job5_stage1_reducer.py", text.encode(), **kw)
    glob, _ = rp.run_stage("job5_global_mapper.py", "job5_global_reducer.py", s1)
    with tempfile.NamedTemporaryFile("wb", suffix=".tsv", delete=False) as f:
        f.write(glob)
    try:
        out, _ = rp.run_stage("job5_filter_mapper.py", "job5_filter_reducer.py", s1, env={"GLOBAL_STATS": f.name}, **kw)
    finally:
        os.unlink(f.name)
    return glob.decode().strip(), list(csv.reader(io.StringIO(out.decode())))


class Job1PeakWifi(unittest.TestCase):
    M, R = "job1_wifi_mapper.py", "job1_wifi_reducer.py"

    def test_mapper_emits_hour_key(self):
        out, _ = rp.run_script(self.M, (WIFI + "S101,2026-08-10 09:15,AP03,120,35\n").encode())
        self.assertEqual(out.decode(), "2026-08-10-09\t120,35,1\n")

    def test_reducer_groups_separate_sorted_lines(self):
        # The worksheet's reference reducer expected "v1;v2" on one line; real input is one line per record.
        rows, _ = job(self.M, self.R, WIFI + "S1,2026-08-10 09:15,AP03,120,35\nS2,2026-08-10 09:59,AP01,30.5,5\n"
                      "S3,2026-08-10 10:00,AP01,1,1\nS1,2026-08-10 09:00,AP02,0,0\n")
        self.assertEqual(rows, [["2026-08-10-09", "150.50", "40.00", "3"], ["2026-08-10-10", "1.00", "1.00", "1"]])

    def test_same_hour_different_dates_are_separate(self):
        rows, _ = job(self.M, self.R, WIFI + "S1,2026-08-10 09:15,AP03,10,1\nS1,2026-08-11 09:15,AP03,20,2\n")
        self.assertEqual([r[0] for r in rows], ["2026-08-10-09", "2026-08-11-09"])

    def test_malformed_rows_rejected_and_counted(self):
        rows, c = job(self.M, self.R, WIFI + "S1,2026-08-10 09:15,AP03,10,1\nS1,hello,AP03,999,1\n"
                      "S1,2026-02-30 09:00,AP03,999,1\nS1,2026-08-10 09:15,AP03,-1,1\nS1,2026-08-10 09:15,AP03,x,1\n"
                      "S1,2026-08-10 09:15,AP03,inf,1\nS1,2026-08-10 09:15,AP03,1\nS1,2026-08-10 09:15,AP03,1,1,1\n")
        self.assertEqual(rows, [["2026-08-10-09", "10.00", "1.00", "1"]])
        self.assertEqual((c["wifi.records"], c["wifi.valid"], c["wifi.rejected"]), (8, 1, 7))
        self.assertEqual(c["wifi.rejected.bad_timestamp"], 2)

    def test_empty_header_only_and_blank_input(self):
        for text in ("", WIFI, WIFI + "\n\n"):
            rows, _ = job(self.M, self.R, text)
            self.assertEqual(rows, [])

    def test_header_in_later_split_is_skipped(self):
        rows, c = job(self.M, self.R, WIFI + "S1,2026-08-10 09:15,AP03,10,1\n" + WIFI, map_tasks=2)
        self.assertEqual(rows, [["2026-08-10-09", "10.00", "1.00", "1"]])
        self.assertEqual(c["wifi.header_lines"], 2)

    def test_peak_tie_breaks_to_earliest_hour(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "job1_hourly_wifi.csv").write_text(
                "Hour,TotalDataMB,TotalDurationMin,Sessions\n2026-08-10-09,5.00,1.00,1\n"
                "2026-08-10-11,50.00,1.00,1\n2026-08-10-10,50.00,9.00,9\n")
            (d / "job4_pairs.csv").write_text("ItemA,ItemB,TransactionCount\n")
            rp.write_rankings(d, b"GLOBAL\t0,0,UNDEFINED\n")
            peak = list(csv.reader(io.StringIO((d / "job1_peak_hours.csv").read_text())))
        self.assertEqual([r[1] for r in peak[1:]], ["2026-08-10-10", "2026-08-10-11", "2026-08-10-09"])

    def test_peak_is_by_hourly_total_not_largest_session(self):
        rows, _ = job(self.M, self.R, WIFI + "S1,2026-08-10 09:00,AP1,100,1\n"
                      + "".join(f"S1,2026-08-10 10:{i:02d},AP1,30,1\n" for i in range(4)))
        self.assertEqual(max(rows, key=lambda r: float(r[1]))[0], "2026-08-10-10")


class Job2AccessPoints(unittest.TestCase):
    def test_totals_and_average(self):
        rows, _ = job("job2_ap_mapper.py", "job2_ap_reducer.py", WIFI + "S1,2026-08-10 09:15,AP03,120,35\n"
                      "S2,2026-08-11 11:00,AP03,30,10\nS3,2026-08-10 09:15,AP01,5,0\nS4,2026-08-10 09:15,AP03,0,0\nbad,row\n")
        self.assertEqual(rows, [["AP01", "5.00", "0.00", "1", "0.00"], ["AP03", "150.00", "45.00", "3", "15.00"]])

    def test_empty(self):
        self.assertEqual(job("job2_ap_mapper.py", "job2_ap_reducer.py", "")[0], [])


class Job3Canteen(unittest.TestCase):
    M, R = "job3_canteen_mapper.py", "job3_canteen_reducer.py"

    def test_amount_is_line_total_and_decimal_exact(self):
        rows, _ = job(self.M, self.R, CANTEEN + "T1,2026-08-10 13:05,S1,Sandwich,2,160\nT2,2026-08-10 13:06,S2,Sandwich,1,80\n"
                      "T3,2026-08-10 13:07,S2,Tea,1,0.1\nT4,2026-08-10 13:07,S2,Tea,1,0.2\nT5,2026-08-10 13:07,S2,Tea,0,0\n")
        self.assertEqual(rows, [["Sandwich", "3", "240.00"], ["Tea", "2", "0.30"]])

    def test_quoted_names_with_commas_and_quotes(self):
        rows, _ = job(self.M, self.R, CANTEEN + 'T1,2026-08-10 13:05,S1,"Chips, Salted",1,20\n'
                      'T2,2026-08-10 13:05,S1,"Masala ""Special"" Dosa",2,180\nT3,2026-08-10 13:05,S1,"Chips, Salted",1,20\n')
        self.assertEqual(sorted(rows), [["Chips, Salted", "2", "40.00"], ['Masala "Special" Dosa', "2", "180.00"]])

    def test_malformed(self):
        rows, c = job(self.M, self.R, CANTEEN + "T1,2026-08-10 13:05,S1,Tea,1.5,30\nT1,2026-08-10 13:05,S1,,1,20\n"
                      'T1,2026-08-10 13:05,S1,"Tea,1,20\nT1,2026-08-10 13:05,S1,Tea,1,-2\nT2,2026-08-10 13:05,S1,Tea,1,20\r\n')
        self.assertEqual(rows, [["Tea", "1", "20.00"]])
        self.assertEqual(c["canteen.rejected"], 4)
        self.assertEqual(c["canteen.rejected.csv_error"], 1)


class Job4CoPurchase(unittest.TestCase):
    def pairs(self, lines, **kw):
        text = CANTEEN + "".join(f"{t},2026-08-10 13:05,S1,{item},1,10\n" for t, item in lines)
        s1, _ = rp.run_stage("job4_stage1_mapper.py", "job4_stage1_reducer.py", text.encode(), **kw)
        out, _ = rp.run_stage("job4_stage2_mapper.py", "job4_stage2_reducer.py", s1, **kw)
        return sorted(tuple(r) for r in csv.reader(io.StringIO(out.decode())))

    def test_two_and_three_items(self):
        self.assertEqual(self.pairs([("T1", "Coffee"), ("T1", "Sandwich")]), [("Coffee", "Sandwich", "1")])
        self.assertEqual(self.pairs([("T1", "C"), ("T1", "A"), ("T1", "B")]),
                         [("A", "B", "1"), ("A", "C", "1"), ("B", "C", "1")])

    def test_duplicates_order_and_non_adjacent_lines(self):
        got = self.pairs([("T1", "Sandwich"), ("T2", "Coffee"), ("T1", "Coffee"), ("T1", "Sandwich"),
                          ("T2", "Sandwich"), ("T3", "Tea"), ("T3", "Tea")])
        self.assertEqual(got, [("Coffee", "Sandwich", "2")])

    def test_single_item_and_empty(self):
        self.assertEqual(self.pairs([("T1", "Tea")]), [])
        self.assertEqual(self.pairs([]), [])

    def test_commas_and_quotes_in_names(self):
        got = self.pairs([("T1", '"Chips, Salted"'), ("T1", '"Masala ""Special"" Dosa"')], reducers=3)
        self.assertEqual(got, [("Chips, Salted", 'Masala "Special" Dosa', "1")])

    def test_stage2_rejects_non_canonical_pair(self):
        with self.assertRaises(rp.StageError):
            rp.run_stage("job4_stage2_mapper.py", "job4_stage2_reducer.py", b'["B", "A"]\t1\n')


class Job5Library(unittest.TestCase):
    def test_strict_threshold_boundary(self):
        # overall = (45 + 3*25) / 4 = 30, threshold 45: S1 exactly at threshold -> not flagged
        g, rows = job5(LIBRARY + "S1,2026-08-10 10:20,ENTRY,45\n" + "S2,2026-08-10 10:20,ENTRY,25\n" * 3)
        self.assertEqual(g, "GLOBAL\t120,4,30")
        self.assertEqual(rows, [])

    def test_above_threshold_and_visit_weighting(self):
        # overall = (46 + 75) / 4 = 30.25 (visit-weighted, not mean of student means), threshold 45.375
        g, rows = job5(LIBRARY + "S1,2026-08-10 10:20,ENTRY,46\n" + "S2,2026-08-11 10:20,ENTRY,25\n" * 3)
        self.assertEqual(rows, [["S1", "46.00", "1", "46.00", "30.25", "45.38"]])

    def test_repeated_visits_and_below_threshold(self):
        text = LIBRARY + "S1,2026-08-10 10:20,ENTRY,100\nS1,2026-08-11 10:20,ENTRY,100\n" + "S2,2026-08-10 10:20,ENTRY,10\n" * 6
        _, rows = job5(text, reducers=2)
        self.assertEqual([(r[0], r[2]) for r in rows], [("S1", "2")])  # 100 > 1.5*(260/8)=48.75; S2 10 not

    def test_empty_zero_and_malformed(self):
        g, rows = job5(LIBRARY)
        self.assertEqual((g, rows), ("GLOBAL\t0,0,UNDEFINED", []))
        g, rows = job5(LIBRARY + "S1,2026-08-10 10:20,ENTRY,0\nS2,2026-08-10 10:20,ENTRY,0\n"
                       "S3,2026-08-10 10:20,EXIT,500\nS3,bad,ENTRY,500\nS3,2026-08-10 10:20,ENTRY,-1\n")
        self.assertEqual((g, rows), ("GLOBAL\t0,2,0", []))

    def test_filter_fails_without_global_file(self):
        with self.assertRaises(rp.StageError):
            rp.run_stage("job5_filter_mapper.py", "job5_filter_reducer.py", b"S1\t10,1\n",
                         env={"GLOBAL_STATS": "/nonexistent/global.tsv"})


class Job6Transport(unittest.TestCase):
    M, R = "job6_transport_mapper.py", "job6_transport_reducer.py"

    def test_classification_boundaries(self):
        rows, _ = job(self.M, self.R, TRANSPORT + "B1,2026-08-10 08:30,R04,18.5\nB2,2026-08-10 08:45,R04,19.5\n"
                      "B1,2026-08-10 09:00,R04,19\nB2,2026-08-10 09:59,R04,21\n"
                      "B1,2026-08-11 08:30,R04,19.99\nB1,2026-08-10 08:30,R-01,40\n")
        self.assertEqual(rows, [["R-01", "2026-08-10-08", "40.00", "1", "NOT_CONGESTED"],
                                ["R04", "2026-08-10-08", "19.00", "2", "CONGESTED"],
                                ["R04", "2026-08-10-09", "20.00", "2", "NOT_CONGESTED"],
                                ["R04", "2026-08-11-08", "19.99", "1", "CONGESTED"]])

    def test_exact_comparison_not_rounded_display(self):
        # average 19.996 displays as 20.00 but is below 20 -> CONGESTED
        rows, _ = job(self.M, self.R, TRANSPORT + "B1,2026-08-10 08:30,R1,19.996\n")
        self.assertEqual(rows, [["R1", "2026-08-10-08", "20.00", "1", "CONGESTED"]])

    def test_malformed_and_empty(self):
        rows, c = job(self.M, self.R, TRANSPORT + "B1,2026-08-10 08:30,R1,-5\nB1,2026-08-10 08:30,,25\n"
                      "B1,2026-08-10 24:00,R1,25\nB1,2026-08-10 08:30,R1,25\n")
        self.assertEqual(rows, [["R1", "2026-08-10-08", "25.00", "1", "NOT_CONGESTED"]])
        self.assertEqual(c["transport.rejected"], 3)
        self.assertEqual(job(self.M, self.R, "")[0], [])


class StreamingContract(unittest.TestCase):
    def test_bom_crlf_and_bad_encoding(self):
        data = ("﻿" + WIFI.replace("\n", "\r\n") + "S1,2026-08-10 09:15,AP03,10,1\r\n").encode() + b"S\xff,2026-08-10 09:15,AP03,10,1\n"
        out, c = rp.run_stage("job1_wifi_mapper.py", "job1_wifi_reducer.py", data)
        self.assertEqual(out, b"2026-08-10-09,10.00,1.00,1\n")
        self.assertEqual((c["wifi.header_lines"], c["wifi.rejected.bad_encoding"]), (1, 1))

    def test_reducer_rejects_malformed_intermediate(self):
        with self.assertRaises(rp.StageError):
            rp.run_script("job1_wifi_reducer.py", b"no-tab-here\n")
        with self.assertRaises(rp.StageError):
            rp.run_script("job1_wifi_reducer.py", b"k\t1,2\n")

    def test_combiner_is_idempotent(self):
        mapped, _ = rp.run_script("job6_transport_mapper.py", (TRANSPORT + "B1,2026-08-10 08:30,R1,10\n"
                                                                "B2,2026-08-10 08:40,R1,30.5\nB2,2026-08-10 09:40,R1,7\n").encode())
        once, _ = rp.run_script("sum_combiner.py", b"".join(sorted(mapped.splitlines(True))))
        twice, _ = rp.run_script("sum_combiner.py", once)
        self.assertEqual(once, twice)
        self.assertEqual(rp.run_script("job6_transport_reducer.py", once)[0],
                         rp.run_script("job6_transport_reducer.py", b"".join(sorted(mapped.splitlines(True))))[0])

    def test_failure_propagates(self):
        failing = [sys.executable, "-c", "import sys; sys.exit(3)"]
        with self.assertRaises(rp.StageError):
            rp.run_stage(failing, "job1_wifi_reducer.py", b"x\n")
        with self.assertRaises(rp.StageError):
            rp.run_stage("job1_wifi_mapper.py", failing, WIFI.encode())
        proc = subprocess.run([sys.executable, str(ROOT / "scripts/run_pipeline.py"), "--data-dir", "/nonexistent",
                               "--out-dir", tempfile.mkdtemp()], capture_output=True)
        self.assertEqual(proc.returncode, 1)


class HadoopKeySemantics(unittest.TestCase):
    """Hadoop sorts by KEY ONLY (text before the first TAB); value order within a key is arbitrary.
    The local runner sorts whole lines, which could hide a composite key that spans a TAB."""

    def key_only_shuffle(self, mapped):
        lines = mapped.splitlines(keepends=True)
        random.Random(1).shuffle(lines)
        return b"".join(sorted(lines, key=lambda ln: ln.split(b"\t", 1)[0]))  # stable: values stay shuffled

    def test_reducers_correct_under_key_only_sort(self):
        data = Path(tempfile.mkdtemp())
        generate("--out-dir", str(data), "--wifi-rows", "800", "--transactions", "200", "--library-visits", "200",
                 "--days", "2", "--students", "40")
        jobs = [("job1_wifi_mapper.py", "job1_wifi_reducer.py", "wifi_logs.csv"),
                ("job2_ap_mapper.py", "job2_ap_reducer.py", "wifi_logs.csv"),
                ("job3_canteen_mapper.py", "job3_canteen_reducer.py", "canteen.csv"),
                ("job4_stage1_mapper.py", "job4_stage1_reducer.py", "canteen.csv"),
                ("job5_stage1_mapper.py", "job5_stage1_reducer.py", "library.csv"),
                ("job6_transport_mapper.py", "job6_transport_reducer.py", "transport.csv")]
        for mapper, reducer, f in jobs:
            raw = (data / f).read_bytes()
            mapped, _ = rp.run_script(mapper, raw)
            hadoop, _ = rp.run_script(reducer, self.key_only_shuffle(mapped))
            local, _ = rp.run_stage(mapper, reducer, raw)
            self.assertEqual(sorted(hadoop.splitlines()), sorted(local.splitlines()), mapper)


class StrictFormats(unittest.TestCase):
    def test_underscore_numbers_and_unpadded_timestamps_rejected(self):
        rows, c = job("job1_wifi_mapper.py", "job1_wifi_reducer.py", WIFI + "S1,2026-08-10 09:15,AP1,1_000,1\n"
                      "S1,2026-8-10 9:15,AP1,1,1\nS1,2026-08-10 09:15,AP1,1,1\n")
        self.assertEqual(rows, [["2026-08-10-09", "1.00", "1.00", "1"]])
        self.assertEqual((c["wifi.rejected.bad_data_mb"], c["wifi.rejected.bad_timestamp"]), (1, 1))

    def test_filter_reducer_rejects_duplicate_student(self):
        with self.assertRaises(rp.StageError):
            rp.run_script("job5_filter_reducer.py", b"S1\t10,1,10,1\nS1\t10,1,10,1\n")


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.data = Path(cls.tmp.name) / "data"
        generate(*["--out-dir", str(cls.data), "--wifi-rows", "1500", "--transactions", "500",
                            "--library-visits", "600", "--days", "3", "--students", "60"])

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_all(self, name, **kw):
        out = Path(self.tmp.name) / name
        counters, _ = rp.run_all(self.data, out, **kw)
        return out, counters

    def test_generator_reproducible(self):
        other = Path(self.tmp.name) / "data2"
        generate(*["--out-dir", str(other), "--wifi-rows", "1500", "--transactions", "500",
                            "--library-visits", "600", "--days", "3", "--students", "60"])
        for f in self.data.iterdir():
            self.assertEqual(f.read_bytes(), (other / f.name).read_bytes(), f.name)
        generate("--out-dir", str(other), "--seed", "7")
        self.assertNotEqual((self.data / "wifi_logs.csv").read_bytes(), (other / "wifi_logs.csv").read_bytes())

    def test_matches_independent_reference_and_invariants(self):
        out, counters = self.run_all("plain")
        self.assertEqual({k: v for k, v in reference.compare(self.data, out).items() if v}, {})
        checks, _ = rp.invariants(self.data, out, counters)
        self.assertEqual([c["check"] for c in checks if not c["passed"]], [])
        exp = reference.expected(self.data)
        self.assertTrue(exp["job5"], "generated data should contain library anomalies")
        statuses = {v[2] for v in exp["job6"].values()}
        self.assertEqual(statuses, {True, False}, "need both congested and free-flowing route-hours")
        self.assertEqual(exp["rejected"], dict.fromkeys(exp["rejected"], 5))  # generator injects 5 per dataset

    def test_deterministic_and_independent_of_combiner_tasks_reducers(self):
        a, _ = self.run_all("a")
        b, _ = self.run_all("b")
        c, _ = self.run_all("c", map_tasks=3, reducers=4, combiner=True)
        for f in sorted(a.glob("*.csv")):
            self.assertEqual(f.read_bytes(), (b / f.name).read_bytes(), f.name)
            self.assertEqual(f.read_bytes(), (c / f.name).read_bytes(), f.name)


if __name__ == "__main__":
    unittest.main()
