import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Sheet } from "@/lib/dataEngine";

const PAGE = 25;

const fmt = (v: any) => {
  if (v === null || v === undefined) return <span className="text-muted-foreground/50">—</span>;
  if (typeof v === "number") return Number.isInteger(v) ? v : v.toFixed(4).replace(/\.?0+$/, "");
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
};

export const DataTable = ({ sheet }: { sheet: Sheet }) => {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(sheet.rows.length / PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = useMemo(
    () => sheet.rows.slice(safePage * PAGE, safePage * PAGE + PAGE),
    [sheet.rows, safePage]
  );

  return (
    <div className="glass-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <p className="font-semibold">{sheet.name}</p>
          <p className="text-xs text-muted-foreground">
            {sheet.rows.length.toLocaleString()} rows · {sheet.columns.length} columns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {safePage + 1} / {totalPages}
          </span>
          <Button size="sm" variant="ghost" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
            <tr>
              {sheet.columns.map((c) => (
                <th key={c} className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-left font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-secondary/40">
                {sheet.columns.map((c) => (
                  <td key={c} className="whitespace-nowrap px-3 py-2">{fmt(r[c])}</td>
                ))}
              </tr>
            ))}
            {!slice.length && (
              <tr><td colSpan={sheet.columns.length} className="px-3 py-8 text-center text-muted-foreground">No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
