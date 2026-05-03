import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  ops?: number;
};

type Props = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
  suggestions?: string[];
};

export const ChatPanel = ({ messages, onSend, disabled, loading, suggestions = [] }: Props) => {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const submit = () => {
    const t = input.trim();
    if (!t || disabled) return;
    onSend(t);
    setInput("");
  };

  return (
    <div className="glass-panel flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">AI Command Center</p>
          <p className="text-xs text-muted-foreground">Ask in plain English</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Try a command like:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  disabled={disabled}
                  className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl rounded-tr-sm bg-primary/15 px-4 py-2 text-sm"
                : `mr-8 rounded-2xl rounded-tl-sm px-4 py-2 text-sm ${m.error ? "bg-destructive/15 text-destructive-foreground" : "bg-secondary/60"}`
            }
          >
            {m.error && <AlertTriangle className="mr-2 inline h-4 w-4" />}
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
            {m.role === "assistant" && m.ops !== undefined && !m.error && (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.ops} operation{m.ops === 1 ? "" : "s"} applied
              </p>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-8 flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary/60 px-4 py-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={disabled ? "Upload a file to begin…" : "e.g. Clean the data and group by region with total sales"}
            disabled={disabled}
            rows={2}
            className="resize-none border-border bg-background/40"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button onClick={submit} disabled={disabled || !input.trim() || loading} size="icon" className="h-10 w-10 rounded-xl">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
