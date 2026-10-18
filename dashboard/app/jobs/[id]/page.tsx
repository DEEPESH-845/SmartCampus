import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DataTable, SourceTabs } from "@/components/interactive";
import { JobResult, OUTPUT_FILE, jobTable } from "@/components/job-views";
import { Code, StageFlow } from "@/components/visuals";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getData, getSource } from "@/lib/data";
import { insights } from "@/lib/insights";
import { JOBS, jobById } from "@/lib/jobs";

export const dynamicParams = false;
export const generateStaticParams = () => JOBS.map((j) => ({ id: String(j.id) }));

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const job = jobById(Number((await params).id));
  return job ? { title: `Job ${job.id}: ${job.title}`, description: job.question } : {};
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const job = jobById(Number((await params).id));
  if (!job) notFound();
  const d = getData();
  const x = insights(d);
  const table = jobTable(job.id, d);
  const files = [...job.scripts, "mr_common.py"].map((name) => ({ name, code: getSource(name) }));
  const prev = jobById(job.id - 1), next = jobById(job.id + 1);
  const tab = "flex-none px-0 pb-3 text-[15px]";

  return (
    <article>
      <header className="max-w-4xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All jobs
        </Link>
        <p className="mt-10 text-[15px] text-faint">Job {job.id} of {JOBS.length}: {job.title}</p>
        <h1 className="display mt-3 text-[clamp(32px,5vw,54px)] leading-[1.05] font-semibold">{x.headline[job.id]}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{job.question}</p>
      </header>

      <section aria-label="Result" className="mt-16">
        <JobResult id={job.id} d={d} />
      </section>

      <Tabs defaultValue="design" className="mt-20 border-t pt-8">
        <TabsList variant="line" className="h-auto max-w-full gap-5 overflow-x-auto p-0 sm:gap-8">
          <TabsTrigger value="design" className={tab}>How it works</TabsTrigger>
          <TabsTrigger value="source" className={tab}>Source code</TabsTrigger>
          <TabsTrigger value="data" className={tab}>Data ({table.rows.length} rows)</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="pt-10">
          <StageFlow input={job.input} stages={job.stages} output={OUTPUT_FILE[job.id]} />
          <p className="mt-8 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">{job.why}</p>
        </TabsContent>
        <TabsContent value="source" className="pt-8">
          <p className="mb-5 max-w-2xl text-[14px] text-muted-foreground">
            The files Hadoop runs, read from <Code>src/</Code> when the site was built. <Code>mr_common.py</Code> holds
            the validation and grouping helpers shared by every job.
          </p>
          <SourceTabs files={files} />
        </TabsContent>
        <TabsContent value="data" className="pt-8">
          <p className="mb-5 text-[14px] text-muted-foreground">
            <Code>outputs/{OUTPUT_FILE[job.id]}</Code>{job.id === 5 ? ", with every student's stage-1 totals" : ""}. Select a column heading to sort.
          </p>
          <DataTable columns={table.columns} rows={table.rows} caption={`Job ${job.id} output`} />
        </TabsContent>
      </Tabs>

      <nav className="mt-24 grid grid-cols-2 gap-6 border-t pt-8" aria-label="Other jobs">
        {prev ? (
          <Link href={`/jobs/${prev.id}/`} className="group">
            <span className="flex items-center gap-1.5 text-[13px] text-faint"><ArrowLeft className="size-3.5" />Job {prev.id}</span>
            <span className="display mt-1 block text-lg font-semibold group-hover:text-series-1">{prev.title}</span>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/jobs/${next.id}/`} className="group text-right">
            <span className="flex items-center justify-end gap-1.5 text-[13px] text-faint">Job {next.id}<ArrowRight className="size-3.5" /></span>
            <span className="display mt-1 block text-lg font-semibold group-hover:text-series-1">{next.title}</span>
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}
