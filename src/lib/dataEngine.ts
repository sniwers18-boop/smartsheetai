// Browser-side execution engine for AI-generated programs.
// Provides sandboxed-ish helpers and runs the model's code against in-memory sheets.

export type Row = Record<string, any>;
export type Sheet = { name: string; rows: Row[]; columns: string[] };
export type Sheets = Record<string, Sheet>;

export type Program = {
  title: string;
  explanation: string;
  code: string;
  needs_clarification?: string;
};

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const cleaned = String(v).replace(/[, $]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};
const str = (v: any) => (v === null || v === undefined ? "" : String(v));
const isEmpty = (v: any) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const unique = <T,>(arr: T[]) => Array.from(new Set(arr));
const nums = (arr: any[]) => arr.map(num).filter((x): x is number => x !== null);
const sum = (arr: any[]) => nums(arr).reduce((s, n) => s + n, 0);
const avg = (arr: any[]) => { const n = nums(arr); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; };
const min = (arr: any[]) => { const n = nums(arr); return n.length ? Math.min(...n) : null; };
const max = (arr: any[]) => { const n = nums(arr); return n.length ? Math.max(...n) : null; };
const median = (arr: any[]) => {
  const n = nums(arr).slice().sort((a, b) => a - b);
  if (!n.length) return null;
  const m = Math.floor(n.length / 2);
  return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
};
const toKey = (v: any) => (v instanceof Date ? v.toISOString() : JSON.stringify(v ?? null));
const groupBy = (rows: Row[], keyOrFn: string | ((r: Row) => any)) => {
  const fn = typeof keyOrFn === "function" ? keyOrFn : (r: Row) => r[keyOrFn];
  const m = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = toKey(fn(r));
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  });
  return m;
};
const sortBy = (rows: Row[], keyOrFn: string | ((r: Row) => any), dir: "asc" | "desc" = "asc") => {
  const fn = typeof keyOrFn === "function" ? keyOrFn : (r: Row) => r[keyOrFn];
  const out = rows.slice();
  out.sort((a, b) => {
    const av = fn(a), bv = fn(b);
    const an = num(av), bn = num(bv);
    let cmp = 0;
    if (an !== null && bn !== null) cmp = an - bn;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    return dir === "desc" ? -cmp : cmp;
  });
  return out;
};
const distinct = (rows: Row[], cols: string[]) => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = cols.map((c) => toKey(r[c])).join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  // Excel serial number
  if (typeof v === "number" && v > 25569 && v < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (d: Date | null, fmt = "yyyy-mm-dd") => {
  if (!d) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  if (fmt === "yyyy-mm") return `${y}-${mo}`;
  if (fmt === "yyyy") return `${y}`;
  return `${y}-${mo}-${da}`;
};
const titleCase = (s: string) => str(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const snakeCase = (s: string) => str(s).trim().replace(/\s+/g, "_").replace(/[^\w]/g, "").toLowerCase();
const camelCase = (s: string) => {
  const parts = str(s).trim().split(/[\s_\-]+/).filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join("");
};
const cleanString = (s: any) => str(s).replace(/\s+/g, " ").trim();
const regex = (pattern: string, flags?: string) => new RegExp(pattern, flags);

const inferColumns = (rows: Row[]) => {
  const seen: string[] = [];
  const set = new Set<string>();
  rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (!set.has(k)) { set.add(k); seen.push(k); }
    });
  });
  return seen;
};

const makeSheet = (name: string, rows: Row[], columns?: string[]): Sheet => ({
  name: name || "Result",
  rows: rows || [],
  columns: columns && columns.length ? columns : inferColumns(rows || []),
});

const join = (
  left: Sheet | Row[],
  right: Sheet | Row[],
  opts: { on?: string | string[]; leftOn?: string | string[]; rightOn?: string | string[]; how?: "inner" | "left" | "right" | "outer" }
): Row[] => {
  const lrows = Array.isArray(left) ? left : left.rows;
  const rrows = Array.isArray(right) ? right : right.rows;
  const arr = (v: any) => (Array.isArray(v) ? v : [v]);
  const lk: string[] = opts.leftOn ? arr(opts.leftOn) : arr(opts.on);
  const rk: string[] = opts.rightOn ? arr(opts.rightOn) : arr(opts.on);
  const how = opts.how || "inner";
  const idx = new Map<string, Row[]>();
  rrows.forEach((r) => {
    const k = rk.map((c) => toKey(r[c])).join("|");
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k)!.push(r);
  });
  const out: Row[] = [];
  const matched = new Set<string>();
  lrows.forEach((l) => {
    const k = lk.map((c) => toKey(l[c])).join("|");
    const m = idx.get(k);
    if (m?.length) { matched.add(k); m.forEach((rr) => out.push({ ...l, ...rr })); }
    else if (how === "left" || how === "outer") out.push({ ...l });
  });
  if (how === "right" || how === "outer") {
    idx.forEach((rrs, k) => { if (!matched.has(k)) rrs.forEach((rr) => out.push({ ...rr })); });
  }
  return out;
};

const aggregate = (vals: any[], fn: string) => {
  switch (fn) {
    case "sum": return sum(vals);
    case "avg": case "mean": return avg(vals);
    case "min": return min(vals);
    case "max": return max(vals);
    case "median": return median(vals);
    case "count": return vals.filter((v) => !isEmpty(v)).length;
    case "count_distinct": return unique(vals.filter((v) => !isEmpty(v))).length;
    case "first": return vals[0] ?? null;
    case "last": return vals[vals.length - 1] ?? null;
    default: return sum(vals);
  }
};

const pivot = ({ rows, index, columns, values, agg = "sum" }: { rows: Row[]; index: string | string[]; columns: string; values: string; agg?: string }) => {
  const idx = Array.isArray(index) ? index : [index];
  const colVals = unique(rows.map((r) => str(r[columns])));
  const groups = new Map<string, Row>();
  rows.forEach((r) => {
    const k = idx.map((c) => toKey(r[c])).join("|");
    if (!groups.has(k)) {
      const o: Row = {};
      idx.forEach((c) => { o[c] = r[c]; });
      colVals.forEach((cv) => { (o as any)["__" + cv] = []; });
      groups.set(k, o);
    }
    const o = groups.get(k)!;
    (o as any)["__" + str(r[columns])].push(r[values]);
  });
  const outRows = Array.from(groups.values()).map((g) => {
    const o: Row = {};
    idx.forEach((c) => { o[c] = g[c]; });
    colVals.forEach((cv) => { o[cv] = aggregate((g as any)["__" + cv], agg); });
    return o;
  });
  return makeSheet("Pivot", outRows, [...idx, ...colVals]);
};

export const buildSchema = (sheets: Sheets) =>
  Object.values(sheets).map((s) => ({
    name: s.name,
    row_count: s.rows.length,
    columns: s.columns.map((c) => {
      const sample = s.rows.find((r) => r[c] !== undefined && r[c] !== null && r[c] !== "")?.[c];
      return { name: c, sample: sample ?? null, inferred_type: typeof sample };
    }),
  }));

const FORBIDDEN = /\b(import|require|fetch|XMLHttpRequest|eval|Function|window|document|globalThis|process|Deno|navigator|localStorage|sessionStorage|WebSocket)\b/;

export async function runProgram(
  program: Program,
  sheets: Sheets,
  activeSheetName: string
): Promise<{ produced: Sheet[]; message?: string }> {
  if (!program.code?.trim()) throw new Error("No program code provided.");
  if (FORBIDDEN.test(program.code)) throw new Error("Generated code referenced a forbidden API.");

  const helpers = {
    num, str, isEmpty, unique, sum, avg, min, max, median,
    groupBy, pivot, join, sortBy, distinct, toDate, fmtDate,
    titleCase, snakeCase, camelCase, cleanString, regex,
    activeSheetName, makeSheet,
  };

  // Build async function. Strict mode disables many sloppy features.
  // eslint-disable-next-line no-new-func
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...args: any[]) => Promise<any>;
  const fn = new AsyncFn("sheets", "helpers", `"use strict";\n${program.code}`);

  // Deep-copy sheets so the program can't mutate originals in surprising ways.
  const cloned: Sheets = {};
  Object.values(sheets).forEach((s) => {
    cloned[s.name] = { name: s.name, columns: [...s.columns], rows: s.rows.map((r) => ({ ...r })) };
  });

  const result = await fn(cloned, helpers);
  const produced: Sheet[] = [];
  let message: string | undefined;

  const normalize = (s: any): Sheet => {
    if (!s || typeof s !== "object") throw new Error("Program returned a non-sheet value.");
    const rows = Array.isArray(s.rows) ? s.rows : [];
    return makeSheet(s.name || "Result", rows, Array.isArray(s.columns) ? s.columns : undefined);
  };

  if (Array.isArray(result)) result.forEach((s) => produced.push(normalize(s)));
  else if (result && typeof result === "object" && Array.isArray(result.sheets)) {
    result.sheets.forEach((s: any) => produced.push(normalize(s)));
    message = result.message;
  } else produced.push(normalize(result));

  if (!produced.length) throw new Error("Program returned no sheets.");
  return { produced, message };
}
