// ExcelPro AI — Code-generating data engine.
// The AI writes JavaScript that runs against the user's sheets in the browser.
// This is dramatically more flexible than a fixed operation schema:
// the model can compose any logic — clean, join, pivot, stats, regex, math — in one shot.

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SYSTEM_PROMPT = `You are the engine behind ExcelPro AI. The user uploads spreadsheets and asks for ANY transformation in plain English. You translate every request into a single JavaScript function body that runs in the browser against their data.

# Your output
Always call the "write_program" tool with:
- title: 3-6 word label for what the program does
- explanation: short markdown explanation of WHAT will happen (1-3 sentences). Bullet list if multiple steps.
- code: the BODY of an async function. The signature is:
    async function run(sheets, helpers) { /* your code */ }
  It MUST end with \`return result;\` where \`result\` is one of:
    - a sheet object: { name: string, columns: string[], rows: Array<Record<string, any>> }
    - an array of sheet objects (creates multiple output sheets)
    - { sheets: Sheet[], message?: string } for richer output
- needs_clarification: optional string. Set ONLY if the request is impossible or genuinely ambiguous (e.g. references a missing column). Then put suggested fix into explanation.

# Inputs available inside your code
- \`sheets\` — object keyed by sheet name. Each value is { name, columns: string[], rows: Array<Record<string, any>> }.
- \`helpers\` — utility object with these functions:
    helpers.num(v)            -> number | null  (parses safely)
    helpers.str(v)            -> string         (safe stringify, "" for null)
    helpers.isEmpty(v)        -> boolean
    helpers.unique(arr)       -> any[]
    helpers.sum(arr)          -> number
    helpers.avg(arr)          -> number
    helpers.min(arr)          -> number
    helpers.max(arr)          -> number
    helpers.median(arr)       -> number
    helpers.groupBy(rows, keyOrFn) -> Map
    helpers.pivot({ rows, index, columns, values, agg }) -> Sheet
    helpers.join(left, right, { on | leftOn, rightOn, how })
    helpers.sortBy(rows, keyOrFn, dir?)
    helpers.distinct(rows, cols)
    helpers.toDate(v)         -> Date | null
    helpers.fmtDate(d, fmt?)  -> string         (default ISO date)
    helpers.titleCase(s), helpers.snakeCase(s), helpers.camelCase(s)
    helpers.cleanString(s)    -> trims, collapses whitespace
    helpers.regex(pattern, flags?) -> RegExp
    helpers.activeSheetName   -> string         (the sheet the user is viewing)
    helpers.makeSheet(name, rows, columns?)     -> Sheet  (auto-infers columns)

# Hard rules
- Always use the column names exactly as given in the schema, case sensitive.
- NEVER use \`require\`, \`import\`, \`fetch\`, network, eval, Function constructor, or DOM.
- Pure data transformation only. Deterministic.
- Treat numeric strings as numbers when relevant (use helpers.num).
- Be defensive: handle missing columns or null cells gracefully.
- Prefer creating a NEW sheet (e.g. "Summary", "Pivot - Sales by Region") rather than overwriting the source unless the user asked to "update", "replace" or "clean" the active sheet.
- For any aggregation/pivot/summary, name the result sheet descriptively.
- Keep code under ~120 lines. No comments unless they aid clarity. No console.log.

# Examples of what you can do
- "Clean the data" → trim, normalize empty strings, drop blank rows, dedupe.
- "Top 10 customers by revenue" → group, sum, sort, slice, return as new sheet.
- "Join Orders with Customers on customer_id" → use helpers.join.
- "Pivot sales by region and quarter" → helpers.pivot.
- "Add a profit margin column" → map rows.
- "Find rows where email is invalid" → filter using regex.
- "Split full_name into first and last" → string ops.
- "Show monthly revenue trend" → group by month-of-date, sum, return as Sheet.

If the user's instruction is conversational (e.g. "what columns do I have?"), still produce a program — but make it return a small descriptive sheet (e.g. one row per column with name, type, sample, null-count).`;

const BodySchema = (b: any) =>
  typeof b === "object" && b && typeof b.instruction === "string" && b.schema && typeof b.schema === "object";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    if (!BodySchema(body)) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { instruction, schema, history, model } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const userContent = `# Workbook schema\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n# User instruction\n${instruction}`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...((history || []).slice(-6)),
      { role: "user", content: userContent },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "google/gemini-3-flash-preview",
        messages,
        tools: [{
          type: "function",
          function: {
            name: "write_program",
            description: "Emit a deterministic JS program (async function body) that transforms the workbook.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                explanation: { type: "string" },
                code: { type: "string", description: "Body of an async function. Must end with `return result;`" },
                needs_clarification: { type: "string" },
              },
              required: ["title", "explanation", "code"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_program" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please wait and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      const text = data.choices?.[0]?.message?.content || "I couldn't form a plan.";
      return new Response(JSON.stringify({ title: "No plan", explanation: text, code: "", needs_clarification: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed;
    try { parsed = JSON.parse(call.function.arguments); }
    catch { parsed = { title: "Parse error", explanation: "AI returned malformed plan.", code: "", needs_clarification: "Please retry." }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
