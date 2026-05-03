// Deterministic data operations engine.
// Receives a plan (array of operations) from the AI and applies them to in-memory sheets.

export type Row = Record<string, any>;
export type Sheet = { name: string; rows: Row[]; columns: string[] };
export type Sheets = Record<string, Sheet>;

export type Operation = any;

const inferColumns = (rows: Row[]): string[] => {
  const set = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
  return Array.from(set);
};

const toNumber = (v: any) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

const isEmpty = (v: any) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const compare = (a: any, op: string, b: any): boolean => {
  switch (op) {
    case "==": return a == b;
    case "!=": return a != b;
    case ">": return Number(a) > Number(b);
    case "<": return Number(a) < Number(b);
    case ">=": return Number(a) >= Number(b);
    case "<=": return Number(a) <= Number(b);
    case "contains": return String(a ?? "").toLowerCase().includes(String(b ?? "").toLowerCase());
    case "not_contains": return !String(a ?? "").toLowerCase().includes(String(b ?? "").toLowerCase());
    case "in": return Array.isArray(b) && b.includes(a);
    case "not_in": return Array.isArray(b) && !b.includes(a);
    case "is_null": return isEmpty(a);
    case "not_null": return !isEmpty(a);
    default: return true;
  }
};

const aggregate = (vals: any[], fn: string) => {
  const nums = vals.map(toNumber).filter((x): x is number => x !== null);
  switch (fn) {
    case "sum": return nums.reduce((s, n) => s + n, 0);
    case "avg": return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
    case "min": return nums.length ? Math.min(...nums) : null;
    case "max": return nums.length ? Math.max(...nums) : null;
    case "count": return vals.filter((v) => !isEmpty(v)).length;
    case "count_distinct": return new Set(vals.filter((v) => !isEmpty(v))).size;
    default: return null;
  }
};

export function applyOperation(sheet: Sheet, op: Operation, sheets: Sheets): Sheet {
  let rows = sheet.rows.map((r) => ({ ...r }));
  let columns = [...sheet.columns];

  switch (op.type) {
    case "trim_whitespace": {
      const cols = op.columns ?? columns;
      rows = rows.map((r) => {
        const o = { ...r };
        cols.forEach((c: string) => { if (typeof o[c] === "string") o[c] = o[c].trim(); });
        return o;
      });
      break;
    }
    case "clean": {
      rows = rows
        .map((r) => {
          const o: Row = {};
          columns.forEach((c) => {
            let v = r[c];
            if (typeof v === "string") v = v.trim();
            if (v === "" || v === "NA" || v === "N/A" || v === "null") v = null;
            o[c] = v;
          });
          return o;
        })
        .filter((r) => columns.some((c) => !isEmpty(r[c])));
      break;
    }
    case "drop_duplicates": {
      const cols = op.columns ?? columns;
      const seen = new Set<string>();
      rows = rows.filter((r) => {
        const key = cols.map((c: string) => JSON.stringify(r[c])).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      break;
    }
    case "drop_na": {
      const cols = op.columns ?? columns;
      const how = op.how ?? "any";
      rows = rows.filter((r) =>
        how === "any"
          ? cols.every((c: string) => !isEmpty(r[c]))
          : !cols.every((c: string) => isEmpty(r[c]))
      );
      break;
    }
    case "fill_na": {
      rows = rows.map((r) => (isEmpty(r[op.column]) ? { ...r, [op.column]: op.value } : r));
      break;
    }
    case "rename": {
      const map: Record<string, string> = op.map || {};
      rows = rows.map((r) => {
        const o: Row = {};
        Object.entries(r).forEach(([k, v]) => { o[map[k] ?? k] = v; });
        return o;
      });
      columns = columns.map((c) => map[c] ?? c);
      break;
    }
    case "select": {
      columns = op.columns;
      rows = rows.map((r) => {
        const o: Row = {};
        op.columns.forEach((c: string) => { o[c] = r[c]; });
        return o;
      });
      break;
    }
    case "drop_columns": {
      const drop = new Set<string>(op.columns);
      columns = columns.filter((c) => !drop.has(c));
      rows = rows.map((r) => {
        const o: Row = {};
        columns.forEach((c) => { o[c] = r[c]; });
        return o;
      });
      break;
    }
    case "filter": {
      rows = rows.filter((r) => compare(r[op.column], op.op, op.value));
      break;
    }
    case "sort": {
      const by = op.by || [];
      rows.sort((a, b) => {
        for (const { column, order } of by) {
          const av = a[column], bv = b[column];
          const an = toNumber(av), bn = toNumber(bv);
          let cmp = 0;
          if (an !== null && bn !== null) cmp = an - bn;
          else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
          if (cmp !== 0) return order === "desc" ? -cmp : cmp;
        }
        return 0;
      });
      break;
    }
    case "add_column": {
      // Safely evaluate a JS expression with `row` in scope. No globals.
      const fn = new Function("row", `"use strict"; try { return (${op.expression}); } catch(e) { return null; }`);
      rows = rows.map((r) => ({ ...r, [op.name]: fn(r) }));
      if (!columns.includes(op.name)) columns.push(op.name);
      break;
    }
    case "cast": {
      rows = rows.map((r) => {
        const v = r[op.column];
        let nv: any = v;
        if (op.to === "number") nv = toNumber(v);
        else if (op.to === "string") nv = v == null ? null : String(v);
        else if (op.to === "boolean") nv = !!v && v !== "false" && v !== "0";
        else if (op.to === "date") {
          const d = v ? new Date(v) : null;
          nv = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
        }
        return { ...r, [op.column]: nv };
      });
      break;
    }
    case "lowercase":
    case "uppercase":
    case "titlecase": {
      const cols = op.columns ?? columns;
      const transform = (s: string) => {
        if (op.type === "lowercase") return s.toLowerCase();
        if (op.type === "uppercase") return s.toUpperCase();
        return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      };
      rows = rows.map((r) => {
        const o = { ...r };
        cols.forEach((c: string) => { if (typeof o[c] === "string") o[c] = transform(o[c]); });
        return o;
      });
      break;
    }
    case "group_by": {
      const by: string[] = op.by;
      const agg: Record<string, { column: string; fn: string }> = op.agg || {};
      const groups = new Map<string, { key: Row; rows: Row[] }>();
      rows.forEach((r) => {
        const key = by.map((c) => JSON.stringify(r[c])).join("|");
        if (!groups.has(key)) {
          const k: Row = {};
          by.forEach((c) => { k[c] = r[c]; });
          groups.set(key, { key: k, rows: [] });
        }
        groups.get(key)!.rows.push(r);
      });
      rows = Array.from(groups.values()).map(({ key, rows: grp }) => {
        const o: Row = { ...key };
        Object.entries(agg).forEach(([newCol, spec]) => {
          o[newCol] = aggregate(grp.map((r) => r[spec.column]), spec.fn);
        });
        return o;
      });
      columns = [...by, ...Object.keys(agg)];
      break;
    }
    case "pivot": {
      const idx: string[] = op.index;
      const colKey: string = op.columns;
      const valKey: string = op.values;
      const fn: string = op.fn || "sum";
      const colVals = Array.from(new Set(rows.map((r) => String(r[colKey] ?? ""))));
      const groups = new Map<string, Row>();
      rows.forEach((r) => {
        const key = idx.map((c) => JSON.stringify(r[c])).join("|");
        if (!groups.has(key)) {
          const o: Row = {};
          idx.forEach((c) => { o[c] = r[c]; });
          colVals.forEach((cv) => { o[cv] = []; });
          groups.set(key, o);
        }
        const o = groups.get(key)!;
        const cv = String(r[colKey] ?? "");
        (o[cv] as any[]).push(r[valKey]);
      });
      rows = Array.from(groups.values()).map((g) => {
        const o: Row = {};
        idx.forEach((c) => { o[c] = g[c]; });
        colVals.forEach((cv) => { o[cv] = aggregate(g[cv] as any[], fn); });
        return o;
      });
      columns = [...idx, ...colVals];
      break;
    }
    case "join": {
      const right = sheets[op.right_sheet];
      if (!right) throw new Error(`Sheet "${op.right_sheet}" not found for join`);
      const on = op.on;
      const leftKeys: string[] = Array.isArray(on) ? on : on.left;
      const rightKeys: string[] = Array.isArray(on) ? on : on.right;
      const how = op.how || "inner";
      const idx = new Map<string, Row[]>();
      right.rows.forEach((r) => {
        const k = rightKeys.map((c) => JSON.stringify(r[c])).join("|");
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k)!.push(r);
      });
      const out: Row[] = [];
      const matchedRight = new Set<string>();
      rows.forEach((l) => {
        const k = leftKeys.map((c) => JSON.stringify(l[c])).join("|");
        const matches = idx.get(k);
        if (matches?.length) {
          matchedRight.add(k);
          matches.forEach((rr) => out.push({ ...l, ...rr }));
        } else if (how === "left" || how === "outer") {
          out.push({ ...l });
        }
      });
      if (how === "right" || how === "outer") {
        idx.forEach((rrs, k) => {
          if (!matchedRight.has(k)) rrs.forEach((rr) => out.push({ ...rr }));
        });
      }
      rows = out;
      columns = inferColumns(rows);
      break;
    }
    case "limit": {
      rows = rows.slice(0, op.n ?? 100);
      break;
    }
    default:
      throw new Error(`Unknown operation: ${op.type}`);
  }

  return { name: sheet.name, rows, columns: columns.length ? columns : inferColumns(rows) };
}

export function applyPlan(
  sheets: Sheets,
  activeSheetName: string,
  plan: { target_sheet?: string | null; output_sheet_name?: string | null; operations: Operation[] }
): { sheet: Sheet; outputName: string } {
  const target = plan.target_sheet || activeSheetName;
  if (!sheets[target]) throw new Error(`Sheet "${target}" not found`);
  let working = { ...sheets[target], rows: sheets[target].rows.map((r) => ({ ...r })) };
  for (const op of plan.operations) {
    working = applyOperation(working, op, sheets);
  }
  const outputName = plan.output_sheet_name || target;
  return { sheet: { ...working, name: outputName }, outputName };
}

export function buildSchema(sheets: Sheets) {
  return Object.values(sheets).map((s) => ({
    name: s.name,
    row_count: s.rows.length,
    columns: s.columns.map((c) => {
      const sample = s.rows.find((r) => r[c] !== undefined && r[c] !== null && r[c] !== "")?.[c];
      return { name: c, sample_value: sample ?? null, type: typeof sample };
    }),
  }));
}
