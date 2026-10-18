import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Section } from "@/components/visuals";
import { getData } from "@/lib/data";
import { day, hourLabel, nf, pairName, rupee } from "@/lib/format";
import { insights } from "@/lib/insights";
import { JOBS } from "@/lib/jobs";

export default function Overview() {
  const d = getData();
  const x = insights(d);
  const passed = d.invariants.filter((c) => c.passed).length;
  const tests = d.tests.match(/Ran (\d+) tests/)?.[1];
  const sample = d.hours.find((h) => h.hour === "2026-08-10-09")!;
  const peak = x.peak[0];

  const findings = [
    { job: 1, figure: hourLabel(peak.hour.slice(11)), note: day(peak.hour.slice(0, 10)),
      text: `Wi-Fi peaks: ${nf(peak.dataMB)} MB moved in a single hour.` },
    { job: 3, figure: x.byRevenue[0].item, note: rupee(x.byRevenue[0].revenue),
      text: `earns the most, although ${x.byQuantity[0].item} sells the most units.` },
    { job: 7, figure: `${nf(x.pairsByRevenue[0].revenue / x.pairsByCount[0].revenue, 1)}×`, note: pairName(x.pairsByRevenue[0]),
      text: `the revenue of ${pairName(x.pairsByCount[0])}, the pair bought most often.` },
    { job: 5, figure: `${x.flagged.length} of ${d.library.students.length}`, note: "students",
      text: `stay more than 1.5× the average library visit of ${nf(d.library.average)} minutes.` },
    { job: 6, figure: nf(x.congested.length), note: "route-hours",
      text: `had buses below 20 km/h, mostly at ${x.worstHours.slice(0, 2).map(hourLabel).join(" and ")} and on ${x.worstRoutes.map(([r]) => r).join(" and ")}.` },
  ];

  const steps = [
    ["Read a line", "S101,2026-08-10 09:15,AP03,120,35"],
    ["Map to key and value", "2026-08-10-09  120,35,1"],
    ["Sort, so the hour's lines meet", `${sample.sessions} lines with key 2026-08-10-09`],
    ["Reduce to one total", `${nf(sample.dataMB, 1)} MB in ${sample.sessions} sessions`],
  ];

  return (
    <div className="space-y-24">
      <header className="max-w-4xl">
        <h1 className="display text-[clamp(40px,7vw,76px)] leading-[1.02] font-semibold">
          What one week of campus logs says
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Seven MapReduce jobs, written as Python scripts for Hadoop Streaming, read Wi-Fi, canteen, library and
          bus logs. The data is synthetic, so the answers describe its generator, not a real campus.
        </p>
        <p className="mt-6 flex items-start gap-2 text-[14px] text-muted-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
          <span>All 7 outputs identical on real Hadoop 3.5.0. {tests ? `${tests} tests` : "Tests"} and {passed} of {d.invariants.length} validation checks pass.</span>
        </p>
      </header>

      <section aria-label="Key findings">
        <ul>
          {findings.map((f) => (
            <li key={f.job} className="border-t last:border-b">
              <Link href={`/jobs/${f.job}/`} className="group grid gap-x-10 gap-y-1 py-7 sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:items-baseline sm:py-8">
                <div>
                  <div className="display text-[clamp(30px,4.5vw,44px)] leading-none font-semibold group-hover:text-series-1">{f.figure}</div>
                  <div className="mt-2 text-[13px] text-faint">{f.note}</div>
                </div>
                <p className="max-w-xl text-[17px] leading-relaxed text-muted-foreground">{f.text}</p>
                <span className="text-[13px] text-faint group-hover:text-foreground">Job {f.job}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Section id="how" title="How one job runs"
        intro="Hadoop splits the input, runs the mapper on every part in parallel, sorts the output so equal keys meet, and hands each key to one reducer. One Wi-Fi record through Job 1:">
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {steps.map(([t, c], i) => (
            <li key={t}>
              <div className="display text-[40px] leading-none font-semibold text-series-1">{i + 1}</div>
              <div className="mt-4 font-medium">{t}</div>
              <code className="mt-2 block font-mono text-[12.5px] break-all text-muted-foreground">{c}</code>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="jobs" title="The seven jobs">
        <ul>
          {JOBS.map((j) => (
            <li key={j.id} className="border-t last:border-b">
              <Link href={`/jobs/${j.id}/`} className="group grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-4 py-4">
                <span className="tabular text-faint">{j.id}</span>
                <span>
                  <span className="font-medium group-hover:text-series-1">{j.question}</span>
                  <span className="mt-0.5 block text-[14px] text-muted-foreground">{x.headline[j.id]}</span>
                </span>
                <span className="flex gap-1" aria-label={`${j.stages.length} MapReduce stage${j.stages.length > 1 ? "s" : ""}`} title={`${j.stages.length} stage${j.stages.length > 1 ? "s" : ""}`}>
                  {j.stages.map((s) => <i key={s.name} className="size-2 rounded-full bg-series-1" />)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-faint">Dots show the number of MapReduce stages in each job.</p>
      </Section>

      <Section id="quality" title="Bad rows are counted, not fatal"
        intro="Each dataset hides five malformed rows. The mappers reject them and report the reason through Hadoop counters, and every output row is checked against an independent implementation.">
        <table className="w-full max-w-2xl text-[15px]">
          <thead>
            <tr className="text-left text-[13px] text-faint">
              <th className="pb-3 font-normal">Dataset</th>
              <th className="pb-3 text-right font-normal">Rows</th>
              <th className="pb-3 text-right font-normal">Valid</th>
              <th className="pb-3 text-right font-normal">Rejected</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {d.quality.map((q) => (
              <tr key={q.dataset} className="border-t">
                <td className="py-3">{q.dataset}</td>
                <td className="py-3 text-right">{nf(q.records)}</td>
                <td className="py-3 text-right">{nf(q.valid)}</td>
                <td className="py-3 text-right">
                  <span className="cursor-help underline decoration-dotted underline-offset-4"
                    data-tip={Object.entries(q.reasons).map(([k, v]) => `${k.replaceAll("_", " ")} (${v})`).join("\n")}>{q.rejected}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <details className="mt-8 max-w-3xl">
          <summary className="w-fit cursor-pointer text-[14px] text-muted-foreground hover:text-foreground">Show all {d.invariants.length} validation checks</summary>
          <ul className="mt-4 grid gap-2 text-[14px] sm:grid-cols-2">
            {d.invariants.map((c) => (
              <li key={c.check} className="flex gap-2 text-muted-foreground">
                <span className={c.passed ? "text-good" : "text-critical"}>{c.passed ? "✓" : "✗"}</span>{c.check}
              </li>
            ))}
          </ul>
        </details>
      </Section>
    </div>
  );
}
