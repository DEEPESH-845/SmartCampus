export type Stage = { name: string; key: string; value: string };
export type Job = {
  id: number;
  short: string;
  title: string;
  question: string;
  input: string;
  stages: Stage[];
  scripts: string[];
  why: string;
};

export const JOBS: Job[] = [
  {
    id: 1, short: "Wi-Fi peak", title: "Peak Wi-Fi usage", question: "When is Wi-Fi busiest?",
    input: "wifi_logs.csv",
    stages: [{ name: "Hourly totals", key: "YYYY-MM-DD-HH", value: "DataMB,DurationMin,1" }],
    scripts: ["job1_wifi_mapper.py", "job1_wifi_reducer.py", "sum_combiner.py"],
    why: "The key is the hour bucket, so the shuffle brings every session of one hour to the same reducer. The date stays in the key so 09:00 on Monday and 09:00 on Tuesday are separate groups. The trailing 1 counts sessions, which also lets a combiner pre-sum each map task's output.",
  },
  {
    id: 2, short: "Access points", title: "Access point utilisation", question: "How loaded is each access point?",
    input: "wifi_logs.csv",
    stages: [{ name: "Per access point", key: "AccessPoint", value: "DataMB,DurationMin,1" }],
    scripts: ["job2_ap_mapper.py", "job2_ap_reducer.py", "sum_combiner.py"],
    why: "Same value shape as Job 1, different key. The average session length is computed only in the reducer as total minutes ÷ sessions, because averages cannot be added but sums and counts can.",
  },
  {
    id: 3, short: "Canteen", title: "Canteen item frequency", question: "What sells, and what earns?",
    input: "canteen.csv",
    stages: [{ name: "Per item", key: "Item", value: "Quantity,Amount" }],
    scripts: ["job3_canteen_mapper.py", "job3_canteen_reducer.py", "sum_combiner.py"],
    why: "Amount is already the line total (2 × Sandwich = 160), so revenue is a plain sum of Amount, never Quantity × Amount. Item names with commas or quotes are parsed with a real CSV reader.",
  },
  {
    id: 4, short: "Item pairs", title: "Top co-purchased items", question: "Which items are bought together?",
    input: "canteen.csv",
    stages: [
      { name: "Build pairs per transaction", key: "TransactionID", value: "Item" },
      { name: "Count pairs", key: '["ItemA","ItemB"]', value: "1" },
    ],
    scripts: ["job4_stage1_mapper.py", "job4_stage1_reducer.py", "job4_stage2_mapper.py", "job4_stage2_reducer.py"],
    why: "Two different groupings need two jobs. Stage 1 groups by transaction so one reducer sees a whole basket, then emits every sorted pair once (no duplicates, no self-pairs). Stage 2 groups by pair and counts. Sorting makes (Coffee, Sandwich) and (Sandwich, Coffee) one key.",
  },
  {
    id: 5, short: "Library", title: "Library usage anomaly", question: "Who stays unusually long in the library?",
    input: "library.csv",
    stages: [
      { name: "Per-student totals", key: "StudentID", value: "DurationMin,1" },
      { name: "Global average", key: "GLOBAL", value: "Total,Visits" },
      { name: "Filter anomalies", key: "StudentID", value: "side file: GLOBAL line" },
    ],
    scripts: ["job5_stage1_mapper.py", "job5_stage1_reducer.py", "job5_global_mapper.py", "job5_global_reducer.py",
      "job5_filter_mapper.py", "job5_filter_reducer.py"],
    why: "Separate jobs share no memory, so the overall average is passed as data: stage 2 maps everything to one GLOBAL key, and stage 3 receives that single line as a distributed-cache side file before flagging students above 1.5 × the average.",
  },
  {
    id: 6, short: "Transport", title: "Transport congestion", question: "Which routes are congested, and when?",
    input: "transport.csv",
    stages: [{ name: "Per route-hour", key: "RouteID|YYYY-MM-DD-HH", value: "SpeedKmph,1" }],
    scripts: ["job6_transport_mapper.py", "job6_transport_reducer.py", "sum_combiner.py"],
    why: "Congestion belongs to one route at one time, so the key is composite. It is joined with | into a single field: with a TAB, Hadoop would treat only RouteID as the key and split route-hours apart. A KeyFieldBasedPartitioner on RouteID sends all hours of a route to one reducer.",
  },
  {
    id: 7, short: "Revenue pairs", title: "High-revenue item pairs (extension)", question: "Which pairs bring in the most money?",
    input: "Job 4 output + Job 3 output",
    stages: [{ name: "Map-only join", key: "(no shuffle)", value: "side file: Job 3 item prices" }],
    scripts: ["job7_revenue_pairs_mapper.py"],
    why: "Chains Job 3 and Job 4, as the worksheet's extension challenge asks. Each pair is independent, so the job has zero reducers: the mapper reads Job 4's pair counts, looks up Job 3's unit prices from a side file, and writes count × (price A + price B).",
  },
];

export const jobById = (id: number) => JOBS.find((j) => j.id === id);
