// Excel AI command interpreter
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are ExcelPro AI's data engine. The user has uploaded one or more sheets of tabular data. They will give natural-language instructions. You must translate the instruction into a JSON plan of deterministic operations applied to the active sheet (or named sheets).

Return a tool call to "build_plan" with:
- explanation: short plain-English summary of what you'll do
- target_sheet: name of sheet to operate on (or null to use the active one)
- output_sheet_name: optional name for the resulting sheet (defaults to active sheet name)
- operations: ordered array of operations. Supported operation types:
  { "type": "trim_whitespace", "columns": ["col"] | null }       // null = all string columns
  { "type": "drop_duplicates", "columns": ["col"] | null }
  { "type": "drop_na", "columns": ["col"] | null, "how": "any" | "all" }
  { "type": "fill_na", "column": "col", "value": <any> }
  { "type": "rename", "map": { "old": "new" } }
  { "type": "select", "columns": ["col1","col2"] }
  { "type": "drop_columns", "columns": ["col"] }
  { "type": "filter", "column": "col", "op": "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "not_contains" | "in" | "not_in" | "is_null" | "not_null", "value": <any> }
  { "type": "sort", "by": [{ "column": "col", "order": "asc" | "desc" }] }
  { "type": "add_column", "name": "new", "expression": "JS expression using row.colName, e.g. row.price * row.qty" }
  { "type": "cast", "column": "col", "to": "number" | "string" | "date" | "boolean" }
  { "type": "lowercase" | "uppercase" | "titlecase", "columns": ["col"] }
  { "type": "group_by", "by": ["col1"], "agg": { "newCol": { "column": "col", "fn": "sum"|"avg"|"min"|"max"|"count"|"count_distinct" } } }
  { "type": "pivot", "index": ["col"], "columns": "col", "values": "col", "fn": "sum"|"avg"|"min"|"max"|"count" }
  { "type": "join", "right_sheet": "name", "on": ["col"] | { "left": ["col"], "right": ["col"] }, "how": "inner"|"left"|"right"|"outer" }
  { "type": "clean", "columns": null }   // trims, removes empty rows, normalizes nulls
  { "type": "limit", "n": 100 }

Be concise. If the user asks for something impossible (e.g. missing column), still produce an operations array of [] and use explanation to clearly state the issue and suggest a fix. Always reference column names exactly as they appear in the schema.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { instruction, schema, history } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const userContent = `SHEETS SCHEMA:\n${JSON.stringify(schema, null, 2)}\n\nUSER INSTRUCTION:\n${instruction}`;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history || []),
      { role: "user", content: userContent },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [{
          type: "function",
          function: {
            name: "build_plan",
            description: "Produce a structured plan of data operations.",
            parameters: {
              type: "object",
              properties: {
                explanation: { type: "string" },
                target_sheet: { type: ["string", "null"] },
                output_sheet_name: { type: ["string", "null"] },
                operations: { type: "array", items: { type: "object" } },
              },
              required: ["explanation", "operations"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "build_plan" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    let plan = { explanation: "No plan returned.", operations: [] as any[] };
    if (call?.function?.arguments) {
      try { plan = JSON.parse(call.function.arguments); } catch (e) { console.error("parse err", e); }
    }
    return new Response(JSON.stringify(plan), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
