// Deterministic data actions for ExcelPro AI.
// Each action has a schema describing the parameters it needs from the user.

import type { Row, Sheet, Sheets } from "./dataEngine";

export type ParamType =
  | "column"
  | "columns"
  | "sheet"
  | "text"
  | "number"
  | "select"
  | "boolean";

export type ParamSpec = {
  key: string;
  label: string;
  type: ParamType;
  options?: { label: string; value: string }[];
  placeholder?: string;
  default?: any;
  optional?: boolean;
  description?: string;
  multiline?: boolean;
};

export type ActionSpec = {
  id: string;
  label: string;
  description: string;
  category: string;
  icon?: string;
  params: ParamSpec[];
  // returns either a new sheet (replaces active) or { sheets, message }
  run: (
    sheets: Sheets,
    activeSheetName: string,
    params: Record<string, any>
  ) => { produced: Sheet[]; message?: string; replaceActive?: boolean };
};

// ===== helpers =====
const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const cleaned = String(v).replace(/[, $%]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};
const str = (v: any) => (v === null || v === undefined ? "" : String(v));
const isEmpty = (v: any) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const inferColumns = (rows: Row[]) => {
  const seen: string[] = [];
  const set = new Set<string>();
  rows.forEach((r) =>
    Object.keys(r).forEach((k) => {
      if (!set.has(k)) {
        set.add(k);
        seen.push(k);
      }
    })
  );
  return seen;
};
const mk = (name: string, rows: Row[], columns?: string[]): Sheet => ({
  name,
  rows,
  columns: columns?.length ? columns : inferColumns(rows),
});
const toDate = (v: any): Date | null => {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && v > 25569 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(v).trim();
  // strip ordinal suffixes "1st", "2nd"
  s = s.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
const formatDate = (d: Date | null, fmt: string) => {
  if (!d) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  switch (fmt) {
    case "YYYY-MM-DD": return `${y}-${mo}-${da}`;
    case "DD/MM/YYYY": return `${da}/${mo}/${y}`;
    case "MM/DD/YYYY": return `${mo}/${da}/${y}`;
    case "DD-MMM-YYYY": return `${da}-${monthsShort[d.getMonth()]}-${y}`;
    case "MMM DD, YYYY": return `${monthsShort[d.getMonth()]} ${da}, ${y}`;
    default: return `${y}-${mo}-${da}`;
  }
};
const titleCase = (s: string) =>
  String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ===== ACTIONS =====

export const ACTIONS: ActionSpec[] = [
  // ---------- 1. Cleaning ----------
  {
    id: "dedupe",
    label: "Remove Duplicates",
    description: "Find & remove duplicate rows. Optionally based on selected columns.",
    category: "Clean",
    params: [
      { key: "cols", label: "Columns to compare (leave empty = all)", type: "columns", optional: true },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const cols: string[] = p.cols?.length ? p.cols : s.columns;
      const seen = new Set<string>();
      let removed = 0;
      const rows = s.rows.filter((r) => {
        const k = cols.map((c) => JSON.stringify(r[c] ?? null)).join("|");
        if (seen.has(k)) { removed++; return false; }
        seen.add(k);
        return true;
      });
      return {
        produced: [mk(s.name, rows, s.columns)],
        replaceActive: true,
        message: `Removed ${removed} duplicate row(s).`,
      };
    },
  },
  {
    id: "standardize_text",
    label: "Standardize Text",
    description: "Trim spaces and fix capitalization in selected columns.",
    category: "Clean",
    params: [
      { key: "cols", label: "Columns", type: "columns" },
      {
        key: "case",
        label: "Capitalization",
        type: "select",
        default: "title",
        options: [
          { label: "Title Case", value: "title" },
          { label: "UPPERCASE", value: "upper" },
          { label: "lowercase", value: "lower" },
          { label: "Sentence case", value: "sentence" },
          { label: "Trim spaces only", value: "none" },
        ],
      },
      {
        key: "replacements",
        label: "Replacements (one per line, e.g. nurealbits=>Neuralbits)",
        type: "text",
        optional: true,
        multiline: true,
        placeholder: "nurealbits=>Neuralbits\npresco inc=>Presco",
      },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const cols: string[] = p.cols;
      const map = new Map<string, string>();
      String(p.replacements || "")
        .split("\n").map((l) => l.split("=>"))
        .forEach(([k, v]) => { if (k && v) map.set(k.trim().toLowerCase(), v.trim()); });

      const transform = (v: any) => {
        if (v == null || typeof v !== "string") return v;
        let out = v.replace(/\s+/g, " ").trim();
        const lower = out.toLowerCase();
        if (map.has(lower)) return map.get(lower)!;
        switch (p.case) {
          case "title": return titleCase(out);
          case "upper": return out.toUpperCase();
          case "lower": return out.toLowerCase();
          case "sentence": return out.charAt(0).toUpperCase() + out.slice(1).toLowerCase();
          default: return out;
        }
      };
      const rows = s.rows.map((r) => {
        const o = { ...r };
        cols.forEach((c) => { o[c] = transform(o[c]); });
        return o;
      });
      return { produced: [mk(s.name, rows, s.columns)], replaceActive: true, message: `Standardized ${cols.length} column(s).` };
    },
  },
  {
    id: "format_dates",
    label: "Format Dates",
    description: "Convert messy dates into a single clean format.",
    category: "Clean",
    params: [
      { key: "cols", label: "Date columns", type: "columns" },
      {
        key: "fmt",
        label: "Output format",
        type: "select",
        default: "YYYY-MM-DD",
        options: [
          { label: "YYYY-MM-DD", value: "YYYY-MM-DD" },
          { label: "DD/MM/YYYY", value: "DD/MM/YYYY" },
          { label: "MM/DD/YYYY", value: "MM/DD/YYYY" },
          { label: "DD-MMM-YYYY", value: "DD-MMM-YYYY" },
          { label: "MMM DD, YYYY", value: "MMM DD, YYYY" },
        ],
      },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      let parsed = 0, failed = 0;
      const rows = s.rows.map((r) => {
        const o = { ...r };
        (p.cols as string[]).forEach((c) => {
          const d = toDate(o[c]);
          if (d) { o[c] = formatDate(d, p.fmt); parsed++; }
          else if (!isEmpty(o[c])) failed++;
        });
        return o;
      });
      return { produced: [mk(s.name, rows, s.columns)], replaceActive: true, message: `Converted ${parsed} value(s). ${failed} unparseable.` };
    },
  },
  {
    id: "handle_nulls",
    label: "Handle Empty Cells",
    description: "Fill empty cells or drop rows that contain them.",
    category: "Clean",
    params: [
      { key: "cols", label: "Columns (empty = all)", type: "columns", optional: true },
      {
        key: "mode",
        label: "Action",
        type: "select",
        default: "fill",
        options: [
          { label: "Fill with value", value: "fill" },
          { label: "Drop rows with empties", value: "drop" },
        ],
      },
      { key: "value", label: "Fill value (e.g. 0, N/A)", type: "text", optional: true, default: "N/A" },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const cols: string[] = p.cols?.length ? p.cols : s.columns;
      if (p.mode === "drop") {
        const before = s.rows.length;
        const rows = s.rows.filter((r) => cols.every((c) => !isEmpty(r[c])));
        return { produced: [mk(s.name, rows, s.columns)], replaceActive: true, message: `Dropped ${before - rows.length} row(s).` };
      }
      let filled = 0;
      const fill = p.value ?? "N/A";
      const rows = s.rows.map((r) => {
        const o = { ...r };
        cols.forEach((c) => { if (isEmpty(o[c])) { o[c] = fill; filled++; } });
        return o;
      });
      return { produced: [mk(s.name, rows, s.columns)], replaceActive: true, message: `Filled ${filled} cell(s) with "${fill}".` };
    },
  },

  // ---------- 2. Organization ----------
  {
    id: "filter",
    label: "Advanced Filter",
    description: "Keep only rows matching one or more rules.",
    category: "Organize",
    params: [
      { key: "col", label: "Column", type: "column" },
      {
        key: "op",
        label: "Operator",
        type: "select",
        default: "equals",
        options: [
          { label: "equals", value: "equals" },
          { label: "not equals", value: "neq" },
          { label: "contains", value: "contains" },
          { label: "does not contain", value: "ncontains" },
          { label: "is empty", value: "empty" },
          { label: "is not empty", value: "nempty" },
          { label: ">", value: "gt" },
          { label: ">=", value: "gte" },
          { label: "<", value: "lt" },
          { label: "<=", value: "lte" },
        ],
      },
      { key: "value", label: "Value", type: "text", optional: true },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const v = p.value;
      const cmp = (rv: any) => {
        switch (p.op) {
          case "equals": return str(rv).toLowerCase() === str(v).toLowerCase();
          case "neq": return str(rv).toLowerCase() !== str(v).toLowerCase();
          case "contains": return str(rv).toLowerCase().includes(str(v).toLowerCase());
          case "ncontains": return !str(rv).toLowerCase().includes(str(v).toLowerCase());
          case "empty": return isEmpty(rv);
          case "nempty": return !isEmpty(rv);
          case "gt": return (num(rv) ?? -Infinity) > (num(v) ?? 0);
          case "gte": return (num(rv) ?? -Infinity) >= (num(v) ?? 0);
          case "lt": return (num(rv) ?? Infinity) < (num(v) ?? 0);
          case "lte": return (num(rv) ?? Infinity) <= (num(v) ?? 0);
        }
        return true;
      };
      const rows = s.rows.filter((r) => cmp(r[p.col]));
      return { produced: [mk(`${s.name} (filtered)`, rows, s.columns)], message: `${rows.length} of ${s.rows.length} rows match.` };
    },
  },
  {
    id: "multi_sort",
    label: "Multi-Level Sort",
    description: "Sort by one column, then another.",
    category: "Organize",
    params: [
      { key: "col1", label: "Sort by (primary)", type: "column" },
      {
        key: "dir1", label: "Direction", type: "select", default: "asc",
        options: [{ label: "Ascending", value: "asc" }, { label: "Descending", value: "desc" }],
      },
      { key: "col2", label: "Then by (secondary)", type: "column", optional: true },
      {
        key: "dir2", label: "Direction", type: "select", default: "asc", optional: true,
        options: [{ label: "Ascending", value: "asc" }, { label: "Descending", value: "desc" }],
      },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const keys: { col: string; dir: string }[] = [{ col: p.col1, dir: p.dir1 }];
      if (p.col2) keys.push({ col: p.col2, dir: p.dir2 || "asc" });
      const rows = s.rows.slice().sort((a, b) => {
        for (const k of keys) {
          const av = a[k.col], bv = b[k.col];
          const an = num(av), bn = num(bv);
          let cmp = 0;
          if (an !== null && bn !== null) cmp = an - bn;
          else cmp = str(av).localeCompare(str(bv));
          if (cmp) return k.dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
      return { produced: [mk(s.name, rows, s.columns)], replaceActive: true, message: `Sorted by ${keys.map(k => `${k.col} (${k.dir})`).join(", ")}.` };
    },
  },
  {
    id: "merge_sheets",
    label: "Merge Sheets",
    description: "Combine two sheets into one (stacked).",
    category: "Organize",
    params: [
      { key: "left", label: "First sheet", type: "sheet" },
      { key: "right", label: "Second sheet", type: "sheet" },
      { key: "name", label: "New sheet name", type: "text", default: "Merged" },
    ],
    run: (sheets, _a, p) => {
      const a = sheets[p.left], b = sheets[p.right];
      if (!a || !b) throw new Error("Pick two sheets to merge.");
      const cols = Array.from(new Set([...a.columns, ...b.columns]));
      const rows = [...a.rows, ...b.rows].map((r) => {
        const o: Row = {}; cols.forEach((c) => { o[c] = r[c] ?? null; }); return o;
      });
      return { produced: [mk(p.name || "Merged", rows, cols)], message: `Merged ${a.rows.length} + ${b.rows.length} = ${rows.length} rows.` };
    },
  },
  {
    id: "hide_columns",
    label: "Hide / Keep Columns",
    description: "Remove columns from view.",
    category: "Organize",
    params: [
      { key: "cols", label: "Columns to keep", type: "columns" },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const cols: string[] = p.cols;
      const rows = s.rows.map((r) => { const o: Row = {}; cols.forEach((c) => { o[c] = r[c]; }); return o; });
      return { produced: [mk(s.name, rows, cols)], replaceActive: true, message: `Kept ${cols.length} column(s).` };
    },
  },

  // ---------- 3. Formulas ----------
  {
    id: "lookup",
    label: "VLOOKUP / XLOOKUP",
    description: "Pull a column from another sheet, matched on a key.",
    category: "Formula",
    params: [
      { key: "right", label: "Lookup sheet", type: "sheet" },
      { key: "leftKey", label: "Key in current sheet", type: "column" },
      { key: "rightKey", label: "Key in lookup sheet", type: "text", placeholder: "column name in lookup sheet" },
      { key: "rightVal", label: "Column to return", type: "text", placeholder: "column name in lookup sheet" },
      { key: "newCol", label: "New column name", type: "text", default: "Lookup" },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const right = sheets[p.right];
      if (!right) throw new Error("Pick a lookup sheet.");
      if (!right.columns.includes(p.rightKey)) throw new Error(`Column "${p.rightKey}" not found in ${right.name}.`);
      if (!right.columns.includes(p.rightVal)) throw new Error(`Column "${p.rightVal}" not found in ${right.name}.`);
      const idx = new Map<string, any>();
      right.rows.forEach((r) => { idx.set(str(r[p.rightKey]).toLowerCase(), r[p.rightVal]); });
      const newCol = p.newCol || "Lookup";
      const rows = s.rows.map((r) => ({ ...r, [newCol]: idx.get(str(r[p.leftKey]).toLowerCase()) ?? null }));
      const cols = s.columns.includes(newCol) ? s.columns : [...s.columns, newCol];
      return { produced: [mk(s.name, rows, cols)], replaceActive: true, message: `Added "${newCol}".` };
    },
  },
  {
    id: "if_then",
    label: "If / Then Rule",
    description: "Add a column based on a condition.",
    category: "Formula",
    params: [
      { key: "col", label: "Check column", type: "column" },
      {
        key: "op", label: "Operator", type: "select", default: "contains",
        options: [
          { label: "equals", value: "equals" },
          { label: "contains", value: "contains" },
          { label: ">", value: "gt" },
          { label: "<", value: "lt" },
          { label: "is empty", value: "empty" },
        ],
      },
      { key: "value", label: "Value", type: "text", optional: true },
      { key: "thenVal", label: "If TRUE → value", type: "text", default: "Yes" },
      { key: "elseVal", label: "If FALSE → value", type: "text", default: "No" },
      { key: "newCol", label: "New column name", type: "text", default: "Flag" },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const test = (rv: any) => {
        switch (p.op) {
          case "equals": return str(rv).toLowerCase() === str(p.value).toLowerCase();
          case "contains": return str(rv).toLowerCase().includes(str(p.value).toLowerCase());
          case "gt": return (num(rv) ?? -Infinity) > (num(p.value) ?? 0);
          case "lt": return (num(rv) ?? Infinity) < (num(p.value) ?? 0);
          case "empty": return isEmpty(rv);
        }
        return false;
      };
      const newCol = p.newCol || "Flag";
      const rows = s.rows.map((r) => ({ ...r, [newCol]: test(r[p.col]) ? p.thenVal : p.elseVal }));
      const cols = s.columns.includes(newCol) ? s.columns : [...s.columns, newCol];
      return { produced: [mk(s.name, rows, cols)], replaceActive: true, message: `Added "${newCol}".` };
    },
  },
  {
    id: "aggregate",
    label: "Math Aggregations",
    description: "Sum, average, min, max, count over a column.",
    category: "Formula",
    params: [
      { key: "col", label: "Numeric column", type: "column" },
      { key: "groupCol", label: "Group by (optional)", type: "column", optional: true },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const calc = (rs: Row[]) => {
        const ns = rs.map((r) => num(r[p.col])).filter((x): x is number => x !== null);
        const sum = ns.reduce((s, x) => s + x, 0);
        return {
          count: rs.length, sum,
          avg: ns.length ? sum / ns.length : 0,
          min: ns.length ? Math.min(...ns) : null,
          max: ns.length ? Math.max(...ns) : null,
        };
      };
      if (p.groupCol) {
        const groups = new Map<string, Row[]>();
        s.rows.forEach((r) => {
          const k = str(r[p.groupCol]);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r);
        });
        const rows = Array.from(groups.entries()).map(([k, rs]) => ({ [p.groupCol]: k, ...calc(rs) }));
        return { produced: [mk(`${p.col} by ${p.groupCol}`, rows)], message: `${rows.length} group(s).` };
      }
      const c = calc(s.rows);
      return { produced: [mk(`${p.col} stats`, [c])], message: `Sum=${c.sum}  Avg=${c.avg.toFixed(2)}  Min=${c.min}  Max=${c.max}` };
    },
  },

  // ---------- 4. Enrichment ----------
  {
    id: "categorize",
    label: "Categorize by Keywords",
    description: "Auto-tag rows when a column contains certain keywords.",
    category: "Enrich",
    params: [
      { key: "col", label: "Column to scan", type: "column" },
      {
        key: "rules", label: "Rules (one per line: keyword=>category)", type: "text", multiline: true,
        placeholder: "udupi=>Local\nbangalore=>Metro\nclinic=>Small",
      },
      { key: "fallback", label: "Fallback category", type: "text", default: "Other" },
      { key: "newCol", label: "New column name", type: "text", default: "Category" },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const rules: { kw: string; cat: string }[] = String(p.rules || "")
        .split("\n").map((l) => l.split("=>"))
        .filter(([k, v]) => k && v).map(([k, v]) => ({ kw: k.trim().toLowerCase(), cat: v.trim() }));
      const newCol = p.newCol || "Category";
      const rows = s.rows.map((r) => {
        const v = str(r[p.col]).toLowerCase();
        const hit = rules.find((rule) => v.includes(rule.kw));
        return { ...r, [newCol]: hit ? hit.cat : (p.fallback || "Other") };
      });
      const cols = s.columns.includes(newCol) ? s.columns : [...s.columns, newCol];
      return { produced: [mk(s.name, rows, cols)], replaceActive: true, message: `Tagged using ${rules.length} rule(s).` };
    },
  },
  {
    id: "geocode",
    label: "Geocode Addresses",
    description: "Add latitude & longitude using OpenStreetMap (free, no key).",
    category: "Enrich",
    params: [
      { key: "col", label: "Address / place column", type: "column" },
      { key: "limit", label: "Max rows to geocode (rate limit)", type: "number", default: 25 },
    ],
    run: () => { throw new Error("Geocode runs asynchronously — use the dedicated runner."); },
  },
  {
    id: "validation_list",
    label: "Build Validation List",
    description: "Create a sheet of allowed values for a dropdown (unique values from a column).",
    category: "Enrich",
    params: [
      { key: "col", label: "Source column", type: "column" },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const set = new Set<string>();
      s.rows.forEach((r) => { const v = str(r[p.col]); if (v) set.add(v); });
      const rows = Array.from(set).sort().map((v) => ({ [p.col]: v }));
      return { produced: [mk(`${p.col} - Allowed`, rows, [p.col])], message: `${rows.length} unique value(s).` };
    },
  },

  // ---------- 5. Analysis ----------
  {
    id: "pivot",
    label: "Pivot Table",
    description: "Summarize totals/counts across groups.",
    category: "Analyze",
    params: [
      { key: "rowCol", label: "Rows", type: "column" },
      { key: "colCol", label: "Columns (optional)", type: "column", optional: true },
      { key: "valCol", label: "Values", type: "column" },
      {
        key: "agg", label: "Aggregation", type: "select", default: "sum",
        options: [
          { label: "Sum", value: "sum" },
          { label: "Average", value: "avg" },
          { label: "Count", value: "count" },
          { label: "Min", value: "min" },
          { label: "Max", value: "max" },
        ],
      },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const aggFn = (vals: any[]) => {
        const ns = vals.map(num).filter((x): x is number => x !== null);
        switch (p.agg) {
          case "sum": return ns.reduce((s, x) => s + x, 0);
          case "avg": return ns.length ? ns.reduce((s, x) => s + x, 0) / ns.length : 0;
          case "count": return vals.filter((v) => !isEmpty(v)).length;
          case "min": return ns.length ? Math.min(...ns) : null;
          case "max": return ns.length ? Math.max(...ns) : null;
        }
        return 0;
      };
      if (p.colCol) {
        const colVals = Array.from(new Set(s.rows.map((r) => str(r[p.colCol])))).sort();
        const groups = new Map<string, Record<string, any[]>>();
        s.rows.forEach((r) => {
          const k = str(r[p.rowCol]);
          if (!groups.has(k)) {
            const o: Record<string, any[]> = {};
            colVals.forEach((cv) => (o[cv] = []));
            groups.set(k, o);
          }
          groups.get(k)![str(r[p.colCol])]?.push(r[p.valCol]);
        });
        const rows = Array.from(groups.entries()).map(([k, o]) => {
          const out: Row = { [p.rowCol]: k };
          colVals.forEach((cv) => (out[cv] = aggFn(o[cv])));
          return out;
        });
        return { produced: [mk("Pivot", rows, [p.rowCol, ...colVals])], message: `${rows.length} group(s).` };
      }
      const groups = new Map<string, any[]>();
      s.rows.forEach((r) => {
        const k = str(r[p.rowCol]);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r[p.valCol]);
      });
      const rows = Array.from(groups.entries()).map(([k, vals]) => ({ [p.rowCol]: k, [p.valCol]: aggFn(vals) }));
      return { produced: [mk("Pivot", rows, [p.rowCol, p.valCol])], message: `${rows.length} group(s).` };
    },
  },
  {
    id: "trend",
    label: "Trend Analysis",
    description: "Detect if a numeric series is going up or down over time.",
    category: "Analyze",
    params: [
      { key: "dateCol", label: "Date column", type: "column" },
      { key: "valCol", label: "Numeric column", type: "column" },
      {
        key: "bucket", label: "Bucket by", type: "select", default: "month",
        options: [
          { label: "Day", value: "day" },
          { label: "Month", value: "month" },
          { label: "Year", value: "year" },
        ],
      },
    ],
    run: (sheets, active, p) => {
      const s = sheets[active];
      const buckets = new Map<string, number[]>();
      s.rows.forEach((r) => {
        const d = toDate(r[p.dateCol]); const v = num(r[p.valCol]);
        if (!d || v === null) return;
        const key = p.bucket === "day"
          ? formatDate(d, "YYYY-MM-DD")
          : p.bucket === "year" ? `${d.getFullYear()}`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(v);
      });
      const rows = Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, vs]) => ({ period: k, total: vs.reduce((s, x) => s + x, 0), avg: vs.reduce((s, x) => s + x, 0) / vs.length, count: vs.length }));
      let direction = "flat";
      if (rows.length >= 2) {
        const first = rows[0].total, last = rows[rows.length - 1].total;
        direction = last > first * 1.05 ? "📈 trending up" : last < first * 0.95 ? "📉 trending down" : "➡ flat";
      }
      return { produced: [mk(`Trend (${p.bucket})`, rows, ["period", "total", "avg", "count"])], message: `${rows.length} period(s) — ${direction}.` };
    },
  },
];

// Async geocoding using OpenStreetMap Nominatim (no key, ~1 req/sec polite limit).
export async function geocodeRows(
  sheets: Sheets,
  active: string,
  col: string,
  limit: number,
  onProgress?: (done: number, total: number) => void
): Promise<{ produced: Sheet[]; message: string }> {
  const s = sheets[active];
  const max = Math.min(limit || 25, s.rows.length);
  const out: Row[] = [];
  let success = 0;
  for (let i = 0; i < s.rows.length; i++) {
    const r = { ...s.rows[i] };
    if (i < max && r[col]) {
      try {
        const q = encodeURIComponent(String(r[col]));
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`, {
          headers: { "Accept-Language": "en" },
        });
        const data = await res.json();
        if (data?.[0]) {
          r.latitude = parseFloat(data[0].lat);
          r.longitude = parseFloat(data[0].lon);
          success++;
        } else { r.latitude = null; r.longitude = null; }
      } catch { r.latitude = null; r.longitude = null; }
      await new Promise((r) => setTimeout(r, 1100));
      onProgress?.(i + 1, max);
    }
    out.push(r);
  }
  const cols = Array.from(new Set([...s.columns, "latitude", "longitude"]));
  return { produced: [mk(s.name, out, cols)], message: `Geocoded ${success}/${max} row(s).` };
}
