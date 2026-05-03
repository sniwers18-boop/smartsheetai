import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import type { Sheet } from "@/lib/dataEngine";

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export const ChartDialog = ({ sheet, open, onOpenChange }: { sheet: Sheet | null; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const [type, setType] = useState<"bar" | "line" | "pie">("bar");
  const [xCol, setX] = useState<string>("");
  const [yCol, setY] = useState<string>("");

  const cols = sheet?.columns || [];
  const data = useMemo(() => {
    if (!sheet || !xCol || !yCol) return [];
    return sheet.rows.slice(0, 50).map((r) => ({ name: String(r[xCol] ?? ""), value: Number(r[yCol]) || 0 }));
  }, [sheet, xCol, yCol]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chart Generator</DialogTitle>
          <DialogDescription>Visualize the current sheet (first 50 rows).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-sm">Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="pie">Pie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Category (X)</Label>
            <Select value={xCol} onValueChange={setX}>
              <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{cols.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Value (Y)</Label>
            <Select value={yCol} onValueChange={setY}>
              <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
              <SelectContent>{cols.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="h-[360px] w-full">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {type === "bar" ? (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              ) : type === "line" ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              ) : (
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" outerRadius={120} label>
                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Pick X and Y columns.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
