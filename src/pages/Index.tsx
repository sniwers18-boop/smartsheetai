import { useMemo, useState } from "react";
import { Dropzone } from "@/components/excelpro/Dropzone";
import { DataTable } from "@/components/excelpro/DataTable";
import { ActionPanel } from "@/components/excelpro/ActionPanel";
import { ActionDialog } from "@/components/excelpro/ActionDialog";
import { ChartDialog } from "@/components/excelpro/ChartDialog";
import { SummaryDialog } from "@/components/excelpro/SummaryDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, RotateCcw, Sparkles, Database } from "lucide-react";
import { parseFile, exportSheets } from "@/lib/fileIO";
import type { Sheets, Sheet } from "@/lib/dataEngine";
import { type ActionSpec, geocodeRows } from "@/lib/actions";
import { toast } from "sonner";

const Index = () => {
  const [originalSheets, setOriginalSheets] = useState<Sheets | null>(null);
  const [sheets, setSheets] = useState<Sheets | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [action, setAction] = useState<ActionSpec | null>(null);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

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
      toast.success(`Loaded ${file.name}`, { description: `${names.length} sheet(s) detected` });
    } catch (e: any) {
      toast.error("Could not read file", { description: e.message });
    }
  };

  const pickAction = (a: ActionSpec) => { setAction(a); setOpen(true); };

  const runAction = async (params: Record<string, any>) => {
    if (!action || !sheets) return;
    setRunning(true);
    try {
      let result;
      if (action.id === "geocode") {
        toast.info("Geocoding via OpenStreetMap…", { description: "~1 row per second" });
        result = await geocodeRows(sheets, activeSheet, params.col, Number(params.limit) || 25);
      } else {
        result = action.run(sheets, activeSheet, params);
      }
      const next = { ...sheets };
      result.produced.forEach((s) => { next[s.name] = s; });
      setSheets(next);
      setActiveSheet(result.produced[0].name);
      toast.success(action.label, { description: result.message });
      setOpen(false);
    } catch (e: any) {
      toast.error("Couldn't run that", { description: e.message });
    } finally {
      setRunning(false);
    }
  };

  const onReset = () => {
    if (originalSheets) {
      setSheets(originalSheets);
      setActiveSheet(Object.keys(originalSheets)[0]);
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
              <p className="text-xs text-muted-foreground">Premium spreadsheet automation — operator toolbox</p>
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

      <section className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Dropzone onFile={onFile} fileName={fileName} />

          {sheetNames.length > 1 && (
            <Tabs value={activeSheet} onValueChange={setActiveSheet}>
              <TabsList className="bg-secondary/50 flex-wrap h-auto">
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
          <ActionPanel
            disabled={!sheets}
            onPick={pickAction}
            onChart={() => setChartOpen(true)}
            onSummary={() => setSummaryOpen(true)}
          />
        </aside>
      </section>

      {sheets && (
        <ActionDialog
          action={action}
          sheets={sheets}
          activeSheet={activeSheet}
          open={open}
          onOpenChange={setOpen}
          onRun={runAction}
          loading={running}
        />
      )}
      <ChartDialog sheet={current} open={chartOpen} onOpenChange={setChartOpen} />
      <SummaryDialog sheet={current} open={summaryOpen} onOpenChange={setSummaryOpen} />
    </main>
  );
};

export default Index;
