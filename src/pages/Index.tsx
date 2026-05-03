import { useMemo, useState } from "react";
import { Dropzone } from "@/components/excelpro/Dropzone";
import { DataTable } from "@/components/excelpro/DataTable";
import { ChatPanel, type ChatMessage } from "@/components/excelpro/ChatPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, RotateCcw, Sparkles, Database } from "lucide-react";
import { parseFile, exportSheets } from "@/lib/fileIO";
import { applyPlan, buildSchema, type Sheets, type Sheet } from "@/lib/dataEngine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_SUGGESTIONS = [
  "Clean the data",
  "Remove duplicate rows",
  "Group by category and sum revenue",
  "Sort by date descending",
  "Create a summary pivot table",
];

const Index = () => {
  const [originalSheets, setOriginalSheets] = useState<Sheets | null>(null);
  const [sheets, setSheets] = useState<Sheets | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const sheetNames = useMemo(() => (sheets ? Object.keys(sheets) : []), [sheets]);
  const current: Sheet | null = sheets && activeSheet ? sheets[activeSheet] : null;

  const onFile = async (file: File) => {
    try {
      const parsed = await parseFile(file);
      const names = Object.keys(parsed);
      if (!names.length) throw new Error("File contained no sheets");
      setOriginalSheets(parsed);
      setSheets(parsed);
      setActiveSheet(names[0]);
      setFileName(file.name);
      setMessages([]);
      toast.success(`Loaded ${file.name}`, { description: `${names.length} sheet(s) detected` });
    } catch (e: any) {
      toast.error("Could not read file", { description: e.message });
    }
  };

  const onSend = async (instruction: string) => {
    if (!sheets || !activeSheet) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: instruction }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const schema = buildSchema(sheets);
      const history = newMessages.slice(-6, -1).map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("excel-ai", {
        body: { instruction, schema: { active_sheet: activeSheet, sheets: schema }, history },
      });

      if (error) throw new Error(error.message || "AI request failed");
      if (data?.error) throw new Error(data.error);

      const plan = data as { explanation: string; target_sheet?: string; output_sheet_name?: string; operations: any[] };

      if (!plan.operations?.length) {
        setMessages([...newMessages, { role: "assistant", content: plan.explanation || "I couldn't determine an action. Try rephrasing.", error: true }]);
        return;
      }

      try {
        const { sheet, outputName } = applyPlan(sheets, activeSheet, plan);
        const next = { ...sheets, [outputName]: sheet };
        setSheets(next);
        setActiveSheet(outputName);
        setMessages([...newMessages, { role: "assistant", content: plan.explanation, ops: plan.operations.length }]);
      } catch (e: any) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            error: true,
            content: `**Couldn't apply the plan:** ${e.message}\n\nTry rephrasing or check that the column names match your sheet.`,
          },
        ]);
      }
    } catch (e: any) {
      setMessages([...newMessages, { role: "assistant", content: e.message, error: true }]);
      toast.error("AI error", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    if (originalSheets) {
      setSheets(originalSheets);
      setActiveSheet(Object.keys(originalSheets)[0]);
      setMessages([]);
      toast.info("Reverted to original data");
    }
  };

  const onExport = () => {
    if (!sheets) return;
    const out = Object.values(sheets);
    const base = fileName?.replace(/\.(xlsx|xls|csv)$/i, "") || "ExcelPro";
    exportSheets(out, `${base}-result.xlsx`);
    toast.success("Exported result");
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/40 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground accent-glow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">ExcelPro AI</h1>
              <p className="text-xs text-muted-foreground">Premium spreadsheet automation, powered by AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onReset} disabled={!originalSheets}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
            <Button size="sm" onClick={onExport} disabled={!sheets} className="rounded-xl">
              <Download className="mr-2 h-4 w-4" /> Download Result
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Dropzone onFile={onFile} fileName={fileName} />

          {sheetNames.length > 1 && (
            <Tabs value={activeSheet} onValueChange={setActiveSheet}>
              <TabsList className="bg-secondary/50">
                {sheetNames.map((n) => (
                  <TabsTrigger key={n} value={n} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    {n}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {current ? (
            <DataTable sheet={current} />
          ) : (
            <div className="glass-panel flex flex-col items-center justify-center px-6 py-16 text-center">
              <Database className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No data loaded yet</p>
              <p className="text-sm text-muted-foreground">Upload an Excel or CSV file to get started.</p>
            </div>
          )}
        </div>

        <aside className="lg:h-[calc(100vh-9rem)] lg:sticky lg:top-6">
          <ChatPanel
            messages={messages}
            onSend={onSend}
            disabled={!sheets}
            loading={loading}
            suggestions={DEFAULT_SUGGESTIONS}
          />
        </aside>
      </section>
    </main>
  );
};

export default Index;
