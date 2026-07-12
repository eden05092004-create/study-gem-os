import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export type AiBlank = {
  id: string;
  label?: string;
  options: string[];
  correct: string;
};

export type AiQuestion = {
  type: "mcq" | "cloze" | "matching" | "truefalse" | "short";
  text: string;
  blanks: AiBlank[];
  explanations?: string[];
};

const questionsSchema = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mcq", "cloze", "matching", "truefalse", "short"],
          },
          text: { type: "string" },
          blanks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correct: { type: "string" },
              },
              required: ["id", "options", "correct"],
            },
          },
          explanations: { type: "array", items: { type: "string" } },
        },
        required: ["type", "text", "blanks"],
      },
    },
    detected: { type: "number" },
    converted: { type: "number" },
  },
  required: ["questions"],
};

async function getKey(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_settings")
    .select("anthropic_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.anthropic_api_key ?? null;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

async function callAnthropic(
  apiKey: string,
  system: string,
  content: ContentBlock[],
): Promise<{ questions: AiQuestion[]; detected?: number; converted?: number }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      tools: [
        {
          name: "save_questions",
          description: "Save the generated or extracted exam questions.",
          input_schema: questionsSchema,
        },
      ],
      tool_choice: { type: "tool", name: "save_questions" },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      res.status === 401
        ? "Invalid API key. Check your Anthropic key in Settings."
        : `AI request failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const json = (await res.json()) as {
    content?: { type: string; input?: unknown }[];
  };
  const toolUse = json.content?.find((c) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("The AI returned no questions.");
  const out = toolUse.input as {
    questions?: AiQuestion[];
    detected?: number;
    converted?: number;
  };
  return {
    questions: out.questions ?? [],
    detected: out.detected,
    converted: out.converted,
  };
}

export const getAiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await getKey(context.supabase, context.userId);
    return { hasKey: !!key };
  });

export const saveAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => {
    if (typeof input?.key !== "string") throw new Error("Invalid key");
    return { key: input.key.trim() };
  })
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("user_settings")
      .upsert(
        { user_id: context.userId, anthropic_api_key: data.key || null },
        { onConflict: "user_id" },
      );
    return { hasKey: !!data.key };
  });

export const generateExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      subject: string;
      types: string[];
      count: number;
    }) => ({
      subject: String(input.subject ?? "").slice(0, 500),
      types: Array.isArray(input.types) ? input.types.slice(0, 5) : [],
      count: Math.min(Math.max(Number(input.count) || 20, 1), 100),
    }),
  )
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const typeList = data.types.length ? data.types.join(", ") : "mixed";
    const system = `You are a medical school examiner. Generate high-quality, exam-style questions.
Return exactly ${data.count} questions via the save_questions tool.
Allowed question types: ${typeList}. If "mixed" is requested, vary across cloze, matching, truefalse, short and mcq.
Format rules per type:
- mcq: text is the question; a single blank whose options are the choices and correct is the right choice. Fill explanations[] (one per option).
- cloze: text is a passage with [[1]], [[2]] tokens; one blank per token (id matches the token number) with options and correct.
- matching: one blank per item; blank.label is the item, options are all candidate descriptions, correct is the right one.
- truefalse: one blank per statement; blank.label is the statement, options are ["True","False"], correct is one of them.
- short: one blank; options empty; correct is the accepted answer. text is the question.`;
    const prompt = `Subject / material to base the exam on:\n${data.subject}\n\nGenerate ${data.count} questions of type(s): ${typeList}.`;

    const out = await callAnthropic(key, system, [{ type: "text", text: prompt }]);
    return { questions: out.questions };
  });

export const parseOldExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pdfBase64: string; mediaType?: string }) => {
    if (typeof input?.pdfBase64 !== "string" || !input.pdfBase64)
      throw new Error("A PDF is required");
    return {
      pdfBase64: input.pdfBase64,
      mediaType: input.mediaType || "application/pdf",
    };
  })
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const system = `You transcribe an existing exam PDF into structured questions. CRITICAL RULES:
- Reproduce every question and every answer option EXACTLY as written. Do NOT reword, translate, fix grammar, or "improve" anything. Keep original typos and punctuation.
- The correct answer is taken ONLY from the value in brackets on a line that says "The correct answer is:". NEVER infer the correct answer from what a student selected or from your own knowledge. If no such line exists for a question, leave correct as an empty string.
- Classify each question into one of: mcq, cloze, matching, truefalse, short (use mcq for standard multiple choice).
- Report "detected" = number of questions you found in the PDF, and "converted" = number you successfully converted with a usable structure.
Blank format per type is the same as our engine: mcq has one blank with options=choices and correct=the bracketed answer.`;
    const out = await callAnthropic(key, system, [
      {
        type: "document",
        source: { type: "base64", media_type: data.mediaType, data: data.pdfBase64 },
      },
      {
        type: "text",
        text: 'Extract all questions from this exam PDF following the rules exactly. Remember: correct answers come only from the "The correct answer is: [...]" lines.',
      },
    ]);
    return {
      questions: out.questions,
      detected: out.detected ?? out.questions.length,
      converted: out.converted ?? out.questions.length,
    };
  });
