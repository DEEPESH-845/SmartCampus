import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DataTable } from "@/components/interactive";
import { Checks, Code, Section, Tile } from "@/components/visuals";
import { getData } from "@/lib/data";
import { nf, pairName, rupee } from "@/lib/format";
import { insights } from "@/lib/insights";
import { JOBS } from "@/lib/jobs";

export default function Overview() {
  const d = getData();
  const x = insights(d);
  const passed = d.invariants.filter((c) => c.passed).length;
  const tests = d.tests.match(/Ran (\d+) tests/)?.[1];
  const rejected = d.quality.reduce((s, q) => s + q.rejected, 0);
  const sample = d.hours.find((h) => h.hour === "2026-08-10-09")!;

  const flow = [
    ["1 · Input line", "S101,2026-08-10 09:15,AP03,120,35", "A raw Wi-Fi log row (the worksheet's example)."],
    ["2 · Map", "2026-08-10-09 ⇥ 120,35,1", "Key = the hour. Value = data, minutes and a count of 1."],
    ["3 · Shuffle & sort", `2026-08-10-09 ⇥ …\n(${sample.sessions} lines, adjacent)`, "Hadoop sorts by key, so every session of that hour arrives together."],
    ["4 · Reduce", `2026-08-10-09,${sample.dataMB.toFixed(2)},${sample.durationMin.toFixed(2)},${sample.sessions}`, `Sums per key: ${nf(sample.dataMB, 1)} MB, ${nf(sample.durationMin)} min, ${sample.sessions} sessions.`],
  ];

  return (
    <div className="space-y-5">
      <header className="pb-2">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-faint uppercase">MapReduce laboratory mini project · Python Hadoop Streaming</p>
        <h1 className="mb-3 text-[clamp(28px,5vw,42px)] leading-tight font-semibold tracking-tight">Smart Campus Analytics</h1>
        <p className="max-w-3xl text-[16px] text-muted-foreground">
          Seven MapReduce jobs turn one week of campus Wi-Fi, canteen, library and transport logs into operational answers:
          when the network peaks, what sells, who lingers, and where buses crawl. The data is synthetic (seed 42), so the
          numbers describe the generator&apos;s patterns, not a real campus.
        </p>
        <div className="mt-5">
          <Checks items={[
            "7 of 7 outputs identical on real Hadoop 3.5.0",
            ...(tests ? [`${tests} automated tests pass`] : []),
            `${passed} of ${d.invariants.length} validation checks pass`,
            `${rejected} malformed rows rejected and counted`,
          ]} />
        </div>
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <Tile href="/jobs/1/" label="Peak Wi-Fi hour" value={x.when(x.peak[0].hour)} sub={x.stat[1]} />
          <Tile href="/jobs/3/" label="Top revenue item" value={x.byRevenue[0].item} sub={`${rupee(x.byRevenue[0].revenue)} · ${x.byQuantity[0].item} sells the most units`} />
          <Tile href="/jobs/7/" label="Most valuable pair" value={pairName(x.pairsByRevenue[0])} sub={x.stat[7]} />
          <Tile href="/jobs/5/" label="Library anomalies" value={`${x.flagged.length} of ${d.library.students.length}`} sub={`students average over ${nf(d.library.threshold, 1)} min`} />
          <Tile href="/jobs/6/" label="Congested route-hours" value={`${x.congested.length} of ${d.routeHours.length}`} sub="average speed below 20 km/h" />
        </div>
      </header>

      <Section eyebrow="How it works" title="Every job is a mapper, a sort and a reducer">
        <p className="mb-4 max-w-3xl text-muted-foreground">
          Each job is a pair of small Python scripts that read lines on stdin and print lines on stdout. Hadoop splits the
          input, runs mappers in parallel, sorts their output by key so equal keys sit together, and gives each key&apos;s
          group to one reducer. Here is one Wi-Fi record travelling through Job 1:
        </p>
        <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {flow.map(([t, c, p]) => (
            <li key={t} className="rounded-xl border bg-background p-3">
              <div className="mb-1.5 text-[13px] font-semibold">{t}</div>
              <code className="block font-mono text-[11.5px] break-all whitespace-pre-wrap">{c}</code>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">{p}</p>
            </li>
          ))}
        </ol>
      </Section>

      <section aria-labelledby="jobs-h">
        <h2 id="jobs-h" className="mt-8 mb-3 text-xl font-semibold">The seven jobs</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {JOBS.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}/`} className="group flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-axis">
              <div className="mb-2 flex items-center justify-between text-xs text-faint">
                <span className="font-medium tracking-wide uppercase">Job {j.id} · {j.short}{j.id === 7 ? " (extension)" : ""}</span>
                <span className="tabular">{j.stages.length} stage{j.stages.length > 1 ? "s" : ""}</span>
              </div>
              <div className="text-[13px] text-muted-foreground">{j.question}</div>
              <div className="mt-1 text-[17px] leading-snug font-semibold">{x.headline[j.id]}</div>
              <div className="mt-1 text-[13px] text-faint">{x.stat[j.id]}</div>
              <div className="mt-auto pt-3 font-mono text-[11.5px] text-muted-foreground">{j.stages[0].key} → {j.stages[0].value}</div>
              <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-series-1">
                Open job <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Section id="quality" eyebrow="Data quality and verification" title="Bad rows are counted, not fatal, and every result is cross-checked">
        <p className="mb-4 max-w-3xl text-muted-foreground">
          Each dataset contains five deliberately malformed rows. Mappers reject them by reason and report the counts through
          Hadoop counters, so nothing disappears silently. After every run, {d.invariants.length} checks compare totals across
          jobs and match every output row against an independent implementation that uses no MapReduce. The same outputs were
          reproduced on real Hadoop 3.5.0.
        </p>
        <DataTable maxHeight="none" caption="Records per dataset"
          columns={[{ label: "Dataset" }, { label: "Records", numeric: true }, { label: "Valid", numeric: true }, { label: "Rejected", numeric: true }, { label: "Rejected because" }]}
          rows={d.quality.map((q) => ({
            cells: [q.dataset, nf(q.records), nf(q.valid), nf(q.rejected), Object.entries(q.reasons).map(([k, v]) => `${k.replaceAll("_", " ")} ×${v}`).join(" · ")],
            sort: [q.dataset, q.records, q.valid, q.rejected, ""],
          }))} />
        <details className="mt-4">
          <summary className="w-fit cursor-pointer text-[13px] text-muted-foreground hover:text-foreground">View all {d.invariants.length} checks ({passed} passed)</summary>
          <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
            {d.invariants.map((c) => (
              <li key={c.check} className="flex gap-2"><span className={c.passed ? "text-good" : "text-critical"}>{c.passed ? "✓" : "✗"}</span>{c.check}</li>
            ))}
          </ul>
        </details>
        <p className="mt-4 text-[13px] text-faint">Run <Code>python3 scripts/run_pipeline.py --run-tests</Code> to regenerate everything this site reads.</p>
      </Section>
    </div>
  );
}
