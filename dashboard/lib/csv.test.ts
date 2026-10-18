import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, splitLine } from "./csv.ts";

test("quoted commas and escaped quotes", () => {
  assert.deepEqual(splitLine('"Chips, Salted","Masala ""Special"" Dosa",32'), ["Chips, Salted", 'Masala "Special" Dosa', "32"]);
  assert.deepEqual(splitLine("a,,b"), ["a", "", "b"]);
});

test("rows keyed by header, CRLF and trailing newline tolerated", () => {
  assert.deepEqual(parseCsv("Item,Qty\r\nTea,651\r\n"), [{ Item: "Tea", Qty: "651" }]);
});
