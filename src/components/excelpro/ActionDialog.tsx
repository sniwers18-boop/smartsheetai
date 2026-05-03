import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActionSpec, ParamSpec } from "@/lib/actions";
import type { Sheets } from "@/lib/dataEngine";

type Props = {
  action: ActionSpec | null;
  sheets: Sheets;
  activeSheet: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRun: (params: Record<string, any>) => void;
  loading?: boolean;
};

export const ActionDialog = ({ action, sheets, activeSheet, open, onOpenChange, onRun, loading }: Props) => {
  const [values, setValues] = useState<Record<string, any>>({});
  const columns = useMemo(() => sheets[activeSheet]?.columns || [], [sheets, activeSheet]);
  const sheetNames = useMemo(() => Object.keys(sheets), [sheets]);

  useEffect(() => {
    if (!action) return;
    const init: Record<string, any> = {};
    action.params.forEach((p) => {
      init[p.key] = p.default ?? (p.type === "columns" ? [] : "");
    });
    setValues(init);
  }, [action]);

  if (!action) return null;

  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  const renderParam = (p: ParamSpec) => {
    switch (p.type) {
      case "column":
        return (
          <Select value={values[p.key] ?? ""} onValueChange={(v) => set(p.key, v)}>
            <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
            <SelectContent>
              {columns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "columns": {
        const sel: string[] = values[p.key] || [];
        return (
          <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background/40 p-2 space-y-1">
            {columns.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-secondary/40">
                <Checkbox
                  checked={sel.includes(c)}
                  onCheckedChange={(v) => set(p.key, v ? [...sel, c] : sel.filter((x) => x !== c))}
                />
                <span className="text-sm">{c}</span>
              </label>
            ))}
          </div>
        );
      }
      case "sheet":
        return (
          <Select value={values[p.key] ?? ""} onValueChange={(v) => set(p.key, v)}>
            <SelectTrigger><SelectValue placeholder="Select sheet" /></SelectTrigger>
            <SelectContent>
              {sheetNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "select":
        return (
          <Select value={values[p.key] ?? p.default ?? ""} onValueChange={(v) => set(p.key, v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {p.options!.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      case "number":
        return (
          <Input type="number" value={values[p.key] ?? ""} onChange={(e) => set(p.key, e.target.value === "" ? "" : Number(e.target.value))} placeholder={p.placeholder} />
        );
      case "boolean":
        return <Checkbox checked={!!values[p.key]} onCheckedChange={(v) => set(p.key, !!v)} />;
      default:
        return p.multiline ? (
          <Textarea rows={4} value={values[p.key] ?? ""} onChange={(e) => set(p.key, e.target.value)} placeholder={p.placeholder} />
        ) : (
          <Input value={values[p.key] ?? ""} onChange={(e) => set(p.key, e.target.value)} placeholder={p.placeholder} />
        );
    }
  };

  const canRun = action.params.every((p) => {
    if (p.optional) return true;
    const v = values[p.key];
    if (p.type === "columns") return Array.isArray(v) && v.length > 0;
    return v !== "" && v !== undefined && v !== null;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {action.params.map((p) => (
            <div key={p.key} className="space-y-1.5">
              <Label className="text-sm">{p.label}{p.optional && <span className="text-muted-foreground"> (optional)</span>}</Label>
              {renderParam(p)}
              {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onRun(values)} disabled={!canRun || loading}>
            {loading ? "Running…" : "Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
