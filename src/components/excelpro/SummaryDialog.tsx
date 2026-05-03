import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Sheet } from "@/lib/dataEngine";
import ReactMarkdown from "react-markdown";

export const SummaryDialog = ({ sheet, open, onOpenChange }: { sheet: Sheet | null; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !sheet) return;
    setLoading(true); setText(""); setErr("");
    const sample = sheet.rows.slice(0, 50);
    const instruction = `Write a concise executive summary (3-5 short paragraphs) for the data in sheet "${sheet.name}". Mention key totals, notable groups, and any visible trends. Plain English. Use bullet points for highlights.`;
    supabase.functions.invoke("excel-ai", {
      body: {
        instruction,
        schema: { active_sheet: sheet.name, sheets: [{ name: sheet.name, row_count: sheet.rows.length, columns: sheet.columns.map((c) => ({ name: c })) }] },
        history: [],
        mode: "summary",
        sample,
      },
    }).then(({ data, error }) => {
      if (error) setErr(error.message);
      else setText(data?.explanation || data?.summary || JSON.stringify(data));
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [open, sheet]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Executive Summary</DialogTitle>
          <DialogDescription>AI-generated overview of {sheet?.name}.</DialogDescription>
        </DialogHeader>
        {loading && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing data…</div>}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {!loading && text && (
          <div className="prose prose-sm prose-invert max-w-none max-h-[60vh] overflow-y-auto">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
