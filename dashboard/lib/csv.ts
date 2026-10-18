/** Minimal RFC 4180 reader for the pipeline's CSVs (quoted fields, "" escapes; no embedded newlines). */
export function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
  const head = splitLine(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(splitLine(l).map((v, i) => [head[i], v])));
}
