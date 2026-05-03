import { Button } from "@/components/ui/button";
import { ACTIONS, type ActionSpec } from "@/lib/actions";
import { Sparkles, BarChart3, FileText } from "lucide-react";

type Props = {
  disabled?: boolean;
  onPick: (a: ActionSpec) => void;
  onChart: () => void;
  onSummary: () => void;
};

const CATEGORIES = ["Clean", "Organize", "Formula", "Enrich", "Analyze"] as const;

export const ActionPanel = ({ disabled, onPick, onChart, onSummary }: Props) => {
  return (
    <div className="glass-panel flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Operator Toolbox</p>
          <p className="text-xs text-muted-foreground">Click an action — we'll ask what we need</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {CATEGORIES.map((cat) => {
          const items = ACTIONS.filter((a) => a.category === cat);
          return (
            <div key={cat}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
              <div className="grid grid-cols-1 gap-1.5">
                {items.map((a) => (
                  <button
                    key={a.id}
                    disabled={disabled}
                    onClick={() => onPick(a)}
                    className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-secondary/60 disabled:opacity-50"
                  >
                    <div className="font-medium">{a.label}</div>
                    <div className="text-xs text-muted-foreground">{a.description}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reporting</p>
          <div className="grid grid-cols-1 gap-1.5">
            <Button variant="outline" disabled={disabled} onClick={onChart} className="justify-start">
              <BarChart3 className="mr-2 h-4 w-4" /> Generate Chart
            </Button>
            <Button variant="outline" disabled={disabled} onClick={onSummary} className="justify-start">
              <FileText className="mr-2 h-4 w-4" /> Executive Summary (AI)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
