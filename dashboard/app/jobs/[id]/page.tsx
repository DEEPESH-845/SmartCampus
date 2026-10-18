import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DataTable, SourceTabs } from "@/components/interactive";
import { JobResult, OUTPUT_FILE, jobTable } from "@/components/job-views";
import { Code, Section, StageFlow } from "@/components/visuals";
import { getData, getSource } from "@/lib/data";
import { insights } from "@/lib/insights";
import { JOBS, jobById } from "@/lib/jobs";

export const dynamicParams = false;
export const generateStaticParams = () => JOBS.map((j) => ({ id: String(j.id) }));

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const job = jobById(Number((await params).id));
  return job ? { title: `Job ${job.id} · ${job.title}`, description: job.question } : {};
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const job = jobById(Number((await params).id));
  if (!job) notFound();
  const d = getData();
  const x = insights(d);
  const table = jobTable(job.id, d);
  const files = [...job.scripts, "mr_common.py"].map((name) => ({ name, code: getSource(name) }));
  const prev = jobById(job.id - 1), next = jobById(job.id + 1);

  return (
    <article className="space-y-5">
      <header>
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All jobs
        </Link>
        <p className="mb-1 text-xs font-medium tracking-wide text-faint uppercase">Job {job.id} · {job.title}</p>
        <h1 className="text-[clamp(24px,4vw,34px)] leading-tight font-semibold tracking-tight">{x.headline[job.id]}</h1>
        <p className="mt-2 text-muted-foreground">{job.question} <span className="text-faint">· {x.stat[job.id]}</span></p>
      </header>

      <Section eyebrow="Result" title="What the output shows">
        <JobResult id={job.id} d={d} />
      </Section>

      <Section eyebrow="Design" title={`How the MapReduce job works (${job.stages.length} stage${job.stages.length > 1 ? "s" : ""})`}>
        <StageFlow input={job.input} stages={job.stages} output={OUTPUT_FILE[job.id]} />
        <p className="mt-4 max-w-3xl text-[15px] text-muted-foreground">{job.why}</p>
      </Section>

      <Section eyebrow="Source" title="The scripts Hadoop runs">
        <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
          The exact files from <Code>src/</Code>, read when this site was built. <Code>mr_common.py</Code> holds the shared
          validation and grouping helpers shipped with every job.
        </p>
        <SourceTabs files={files} />
      </Section>

      <Section eyebrow="Data" title={`Full output (${table.rows.length} rows)`}>
        <p className="mb-3 text-sm text-muted-foreground">From <Code>outputs/{OUTPUT_FILE[job.id]}</Code>{job.id === 5 ? " plus the per-student totals from stage 1" : ""}. Click a column to sort.</p>
        <DataTable columns={table.columns} rows={table.rows} caption={`Job ${job.id} output`} />
      </Section>

      <nav className="flex justify-between gap-3 pt-2 text-sm" aria-label="Other jobs">
        {prev ? <Link href={`/jobs/${prev.id}/`} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 hover:border-axis"><ArrowLeft className="size-4" />Job {prev.id} · {prev.short}</Link> : <span />}
        {next ? <Link href={`/jobs/${next.id}/`} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 hover:border-axis">Job {next.id} · {next.short}<ArrowRight className="size-4" /></Link> : <span />}
      </nav>
    </article>
  );
}
