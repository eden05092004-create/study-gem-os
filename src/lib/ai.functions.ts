import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

export type AiBlank = {
  id: string;
  label?: string;
  options: string[];
  correct: string;
  /** one explanation per option (same order as options[]) — why each is right or wrong */
  explanations?: string[];
};

export type AiImageLabel = { id: string; x: number; y: number };

export type AiQuestion = {
  type:
    | "mcq"
    | "cloze"
    | "matching"
    | "truefalse"
    | "short"
    | "image_identify"
    | "image_matching"
    | "image_clinical";
  text: string;
  blanks: AiBlank[];
  explanations?: string[];
  /** index into the images array supplied to the model; resolved to a data URL client-side */
  imageIndex?: number;
  imageLabels?: AiImageLabel[];
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
            enum: [
              "mcq",
              "cloze",
              "matching",
              "truefalse",
              "short",
              "image_identify",
              "image_matching",
              "image_clinical",
            ],
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
                explanations: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "One entry per option, same order as options[] — why each option is correct or incorrect for this blank.",
                },
              },
              required: ["id", "options", "correct"],
            },
          },
          explanations: { type: "array", items: { type: "string" } },
          imageIndex: {
            type: "number",
            description:
              "0-based index of the source image this question uses (only for image_* types).",
          },
          imageLabels: {
            type: "array",
            description:
              "Numbered markers to overlay on the image; id must match a blank id. x/y are normalized 0..1 coordinates.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
              },
              required: ["id", "x", "y"],
            },
          },
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
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | {
      type: "document";
      source: { type: "base64"; media_type: string; data: string };
      cache_control?: { type: "ephemeral" };
    }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
      cache_control?: { type: "ephemeral" };
    };

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
      // Streamed so Cloudflare's ~100s idle-timeout doesn't 524 on long exams.
      stream: true,
      max_tokens: 32000,
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

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401
        ? "Invalid API key. Check your Anthropic key in Settings."
        : `AI request failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }

  const toolJson = await readToolUseJson(res.body);
  if (!toolJson) throw new Error("The AI returned no questions.");
  let out: { questions?: AiQuestion[]; detected?: number; converted?: number };
  try {
    out = JSON.parse(toolJson);
  } catch {
    throw new Error("The AI returned malformed output.");
  }
  return {
    questions: out.questions ?? [],
    detected: out.detected,
    converted: out.converted,
  };
}

/** Reads an Anthropic SSE stream and concatenates the `input_json_delta` chunks
 *  of the tool_use content block into a full JSON string. */
async function readToolUseJson(body: ReadableStream<Uint8Array>): Promise<string | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let json = "";
  let inToolBlock = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          content_block?: { type?: string };
          delta?: { type?: string; partial_json?: string };
        };
        if (evt.type === "content_block_start") {
          inToolBlock = evt.content_block?.type === "tool_use";
        } else if (
          inToolBlock &&
          evt.type === "content_block_delta" &&
          evt.delta?.type === "input_json_delta" &&
          typeof evt.delta.partial_json === "string"
        ) {
          json += evt.delta.partial_json;
        } else if (evt.type === "content_block_stop") {
          inToolBlock = false;
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
  return json || null;
}

export type AiNoteSection = {
  key: string;
  title: string;
  icon: string;
  body: string;
};

const notesSchema = {
  type: "object" as const,
  properties: {
    title: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          icon: { type: "string" },
          body: { type: "string" },
        },
        required: ["key", "title", "icon", "body"],
      },
    },
    coverage: { type: "string" },
  },
  required: ["title", "sections"],
};

async function callAnthropicNotes(
  apiKey: string,
  system: string,
  content: ContentBlock[],
): Promise<{ title: string; sections: AiNoteSection[]; coverage?: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system,
      tools: [
        {
          name: "save_notes",
          description: "Save the generated textbook-style study notes.",
          input_schema: notesSchema,
        },
      ],
      tool_choice: { type: "tool", name: "save_notes" },
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
  if (!toolUse?.input) throw new Error("The AI returned no notes.");
  const out = toolUse.input as {
    title?: string;
    sections?: AiNoteSection[];
    coverage?: string;
  };
  return {
    title: out.title ?? "Study notes",
    sections: out.sections ?? [],
    coverage: out.coverage,
  };
}

/** Canonical note sections, in required order. */
export const NOTE_SECTION_SPECS: {
  key: string;
  title: string;
  icon: string;
  guide: string;
}[] = [
  { key: "overview", title: "Overview", icon: "📌", guide: "A high-level orientation to the whole topic." },
  { key: "full", title: "Full Content", icon: "📖", guide: "Use markdown-style headings and textbook-level explanations covering ALL material. This is the core section — cover every slide/page/section with zero omission." },
  { key: "tables", title: "Comparison Tables", icon: "📊", guide: "Create comparison tables where relevant; render as plain-text tables." },
  { key: "highyield", title: "High Yield", icon: "⭐", guide: "The points most likely to appear on the exam." },
  { key: "clinical", title: "Clinical Correlations", icon: "🏥", guide: "Clinical relevance and correlations." },
  { key: "mistakes", title: "Common Mistakes", icon: "⚠️", guide: "Common misconceptions and errors students make." },
  { key: "details", title: "Small Details", icon: "🔍", guide: "Exact numbers, exceptions, footnotes, specific values, named researchers — the easily-missed details." },
  { key: "quickcheck", title: "Quick Check", icon: "❓", guide: "3-4 self-test questions with answers." },
  { key: "coverage", title: "Coverage Check", icon: "✅", guide: "List which slides/pages/sections were covered, confirming nothing was omitted." },
];

export const generateNotesChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { subject: string; detail: string; sectionKeys?: string[]; part?: number; total?: number }) => {
      const valid = new Set(NOTE_SECTION_SPECS.map((s) => s.key));
      const keys = Array.isArray(input.sectionKeys)
        ? input.sectionKeys.filter((k) => valid.has(k))
        : [];
      return {
        subject: String(input.subject ?? "").slice(0, 2000),
        detail: ["detailed", "balanced", "concise"].includes(input.detail)
          ? input.detail
          : "balanced",
        sectionKeys: keys.length ? keys : NOTE_SECTION_SPECS.map((s) => s.key),
        part: Math.max(1, Number(input.part) || 1),
        total: Math.max(1, Number(input.total) || 1),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const detailGuide =
      data.detail === "detailed"
        ? "Be exhaustive. Expand every point into thorough textbook-level prose. Long explanations."
        : data.detail === "concise"
          ? "Keep explanations tight and focused, but still complete — never drop a slide or page."
          : "Balanced textbook depth: clear, complete explanations without excessive padding.";

    const specs = NOTE_SECTION_SPECS.filter((s) => data.sectionKeys.includes(s.key));
    const sectionList = specs
      .map((s, i) => `${i + 1}. key "${s.key}", title "${s.title}", icon "${s.icon}" — ${s.guide}`)
      .join("\n");

    const system = `You are an expert medical school professor writing professional, textbook-style study notes from lecture material.

ABSOLUTE RULES:
- ZERO OMISSION: every single slide / page / section of the source material MUST be represented in the notes. Do NOT drop anything as "unimportant" — professors test tiny details.
- This is NOT a summary. Expand terse bullet points into full, flowing textbook-quality explanations. Teach the concept as a textbook chapter would.
- Detail level: ${detailGuide}
- You are writing PART ${data.part} of ${data.total} of a larger note. Produce ONLY the sections requested below, but base them on the ENTIRE source material so nothing is omitted.

Return via the save_notes tool. Provide EXACTLY these sections, in this order, using these exact keys/titles/icons:
${sectionList}

Write the "body" of each section as readable text (paragraphs, headings, lists). Set "title" to a short note title.`;
    const prompt = `Source material to turn into complete textbook-style notes:\n${data.subject}\n\nProduce ONLY the requested sections now, covering every slide/page with zero omission.`;

    const out = await callAnthropicNotes(key, system, [
      { type: "text", text: prompt },
    ]);
    // Keep only requested sections, in canonical order.
    const byKey = new Map(out.sections.map((s) => [s.key, s]));
    const sections = specs
      .map((spec) => {
        const s = byKey.get(spec.key);
        return s
          ? { ...s, title: spec.title, icon: spec.icon }
          : null;
      })
      .filter((s): s is AiNoteSection => !!s);

    return { title: out.title, sections, coverage: out.coverage };
  });

export const generateNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { subject: string; detail: string }) => ({
      subject: String(input.subject ?? "").slice(0, 2000),
      detail: ["detailed", "balanced", "concise"].includes(input.detail)
        ? input.detail
        : "balanced",
    }),
  )
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const detailGuide =
      data.detail === "detailed"
        ? "Be exhaustive. Expand every point into thorough textbook-level prose. Long explanations."
        : data.detail === "concise"
          ? "Keep explanations tight and focused, but still complete — never drop a slide or page."
          : "Balanced textbook depth: clear, complete explanations without excessive padding.";

    const system = `You are an expert medical school professor writing professional, textbook-style study notes from lecture material.

ABSOLUTE RULES:
- ZERO OMISSION: every single slide / page / section of the source material MUST be represented in the notes. Do NOT drop anything as "unimportant" — professors test tiny details.
- This is NOT a summary. Expand terse bullet points into full, flowing textbook-quality explanations. Teach the concept as a textbook chapter would.
- Detail level: ${detailGuide}

Return the notes via the save_notes tool with EXACTLY these sections in this order, using these exact keys, titles and icons:
1. key "overview", title "Overview", icon "📌"
2. key "full", title "Full Content", icon "📖" (use markdown-style headings and textbook-level explanations covering ALL material)
3. key "tables", title "Comparison Tables", icon "📊" (create comparison tables where relevant; render as plain-text tables)
4. key "highyield", title "High Yield", icon "⭐" (the points most likely to appear on the exam)
5. key "clinical", title "Clinical Correlations", icon "🏥"
6. key "mistakes", title "Common Mistakes", icon "⚠️"
7. key "details", title "Small Details", icon "🔍" (exact numbers, exceptions, footnotes, specific values, named researchers — the easily-missed details)
8. key "quickcheck", title "Quick Check", icon "❓" (3-4 self-test questions with answers)
9. key "coverage", title "Coverage Check", icon "✅" (list which slides/pages/sections were covered, confirming nothing was omitted)

Also fill "coverage" with the same coverage summary. Write the "body" of each section as readable text (paragraphs, headings, lists).`;
    const prompt = `Source material to turn into complete textbook-style notes:\n${data.subject}\n\nProduce the full notes now, covering every slide/page with zero omission.`;

    const out = await callAnthropicNotes(key, system, [
      { type: "text", text: prompt },
    ]);
    return { title: out.title, sections: out.sections, coverage: out.coverage };
  });

export const getAiKeyStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const auth = getRequestHeader("authorization");
      if (!auth) return { hasKey: false };
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_PUBLISHABLE_KEY!,
        { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
      );
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { hasKey: false };
      const key = await getKey(supabase as any, userData.user.id);
      return { hasKey: !!key };
    } catch {
      return { hasKey: false };
    }
  },
);

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

type AiImageInput = { data: string; mediaType: string };

function sanitizeImages(input: unknown): AiImageInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (im): im is AiImageInput =>
        !!im && typeof im.data === "string" && typeof im.mediaType === "string",
    )
    .slice(0, 20)
    .map((im) => ({ data: im.data, mediaType: im.mediaType }));
}

function sanitizeDocuments(input: unknown): AiImageInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (d): d is AiImageInput => !!d && typeof d.data === "string" && typeof d.mediaType === "string",
    )
    .slice(0, 12)
    .map((d) => ({ data: d.data, mediaType: d.mediaType }));
}

export const generateExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      subject: string;
      types: string[];
      count: number;
      noteText?: string;
      documents?: AiImageInput[];
    }) => ({
      subject: String(input.subject ?? "").slice(0, 1000),
      types: Array.isArray(input.types) ? input.types.slice(0, 5) : [],
      count: Math.min(Math.max(Number(input.count) || 20, 1), 100),
      noteText: typeof input.noteText === "string" ? input.noteText.slice(0, 60000) : "",
      documents: sanitizeDocuments(input.documents),
    }),
  )
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const typeList = data.types.length ? data.types.join(", ") : "mixed";
    const hasMaterial = data.documents.length > 0 || data.noteText.length > 0;
    const system = `You are a senior medical school examiner writing questions for a real, graded university exam. Generate high-quality, exam-style questions via the save_questions tool.

GROUNDING (most important rule):
${
  hasMaterial
    ? "- Base EVERY question strictly on the supplied source material below (attached documents and/or notes). Do not introduce facts, numbers, or claims that are not present in that material. If the material doesn't cover something, don't ask about it."
    : "- No source material was supplied. State that internally and rely only on well-established, general medical curriculum knowledge for the given subject — never invent specific studies, numbers, or claims you aren't confident are standard textbook fact."
}
- Never fabricate citations, statistics, or named studies.

QUALITY BAR (real med-school exam, not a basic quiz):
- Favor single-best-answer clinical-vignette style stems for mcq: a short realistic patient/scenario or applied-reasoning setup, then a precise question — the kind that requires synthesizing the material, not just recalling a definition.
- Test understanding and application (mechanisms, cause-and-effect, "what happens if X", differentiating close concepts) — avoid trivial recall or questions answerable from the stem alone.
- Every question must be materially different from the others in this batch — no near-duplicate stems or rephrased repeats of the same fact.
- Distractors (wrong mcq options) must be plausible and topic-relevant, not obviously wrong filler.
- Write in clear, professional exam language — no filler, no hedging, no "trick" wording for its own sake.

Return exactly ${data.count} questions. Allowed question types: ${typeList}. If "mixed" is requested, favor mcq for most questions and vary the remainder across cloze, matching, truefalse, short.
Format rules per type:
- mcq: text is the question/vignette; a single blank whose options are 4-6 choices and correct is the right choice. Fill explanations[] (one per option, explaining why it's right or wrong).
- cloze: text is a passage with [[1]], [[2]] tokens; one blank per token (id matches the token number) with options and correct.
- matching: one blank per item; blank.label is the item, options are all candidate descriptions, correct is the right one.
- truefalse: one blank per statement; blank.label is the statement, options are ["True","False"], correct is one of them.
- short: one blank; options empty; correct is the accepted answer. text is the question.`;

    const content: ContentBlock[] = [];
    data.documents.forEach((doc) => {
      content.push({ type: "document", source: { type: "base64", media_type: doc.mediaType, data: doc.data } });
    });
    let prompt = `Subject / scope:\n${data.subject}\n\nGenerate ${data.count} questions of type(s): ${typeList}.`;
    if (data.noteText) prompt += `\n\nSource notes:\n${data.noteText}`;
    content.push({ type: "text", text: prompt });

    const out = await callAnthropic(key, system, content);
    return { questions: out.questions };
  });

export const parseOldExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { pdfBase64: string; mediaType?: string; images?: AiImageInput[] }) => {
      if (typeof input?.pdfBase64 !== "string" || !input.pdfBase64)
        throw new Error("A PDF is required");
      return {
        pdfBase64: input.pdfBase64,
        mediaType: input.mediaType || "application/pdf",
        images: sanitizeImages(input.images),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const hasImages = data.images.length > 0;
    const system = `You convert an EXISTING exam PDF into an interactive practice exam that is AS CLOSE AS POSSIBLE to the original. Preserve BOTH the exact wording AND the exact question TYPE of every original question. CRITICAL RULES — follow exactly:

1. REPRODUCE THE QUESTION/PASSAGE EXACTLY: copy every question, passage and surrounding text EXACTLY as written. Do NOT reword, translate, fix grammar, "improve", normalize, or restructure the wording. Keep original typos, punctuation, casing and spacing.

2. PRESERVE THE ORIGINAL QUESTION TYPE — never convert one format into another:
   - CLOZE (fill-in-the-blank): the source has a gap (blank line, underline, ellipsis, bracket) inside a sentence/passage. Keep the surrounding text EXACTLY and replace ONLY the missing word/phrase with a token [[1]], [[2]], … in reading order. A passage with multiple blanks stays ONE cloze question. Do NOT reveal the answer inside the passage text.
   - MCQ: the source itself presents a standalone question with its own visible answer choices (A/B/C/D or similar). Copy the stem and choices exactly.
   - TRUE/FALSE: the source presents statement(s) to be marked True or False (single statement, or a list/table of statements). Use type "truefalse", one blank per statement, blank.label = the statement copied verbatim, options = ["True","False"], correct = whichever the answer key marks.
   - SHORT / OPEN QUESTIONS: the source asks an open-ended question expecting a written free-text answer with no choices in the source. Use type "short", one blank, options[] EMPTY, correct = the answer from the answer key (verbatim if given, otherwise a concise correct answer). Do NOT invent multiple-choice options for an open question.
   - MATCHING: the source explicitly asks to match items to descriptions. Use type "matching".
   Never change a short/open question into an MCQ, never change a true/false into a cloze, never split a multi-blank cloze into separate questions. The reader must see the same question format as in the original exam.

3. CORRECT ANSWER SOURCE — VISUAL, FROM THE PAGE IMAGE: the rasterized page images supplied after the document are REQUIRED grading input. For each blank/question, find the YELLOW-HIGHLIGHTED answer in the answer box/key (often at the bottom of the page or exam). That highlighted text is the correct answer, copied EXACTLY as highlighted.
   - NEVER use a student's circled answer, checkmark, or handwritten mark — those may be WRONG and must be ignored.
   - NEVER guess the correct answer from your own knowledge.
   - If no yellow highlight exists for a blank, leave its "correct" as an empty string.

4. OPTIONS RULES BY TYPE:
   - CLOZE and MCQ blanks: give every blank 4-8 options — the real answer (from the yellow highlight, verbatim) plus realistic distractors. Distractors must be scientifically accurate as standalone facts, plausible, distinct, and matched in length/register to the real answer. If the source already shows options, keep those and only top up if fewer than 4.
   - TRUEFALSE blanks: options must be exactly ["True","False"].
   - SHORT blanks: options[] MUST be empty — do not fabricate choices for an open question.
   - MATCHING blanks: options are the candidate descriptions.

5. PER-BLANK EXPLANATIONS — REQUIRED for every blank that has options (cloze, mcq, truefalse, matching): fill blanks[].explanations[] with exactly one entry per option, in the SAME ORDER as options[]. Each entry is 1-2 sentences of accurate rationale for why that option is correct or incorrect for this blank. Short-answer blanks (no options) do not need explanations.

6. RANDOMIZE OPTION ORDER for cloze/mcq/matching blanks (keep explanations aligned). Do NOT randomize the ["True","False"] pair.

7. PARTIAL CREDIT: each blank counts as 1 point; include every blank.

8. IMAGES: if a question refers to a figure/diagram in the material, KEEP the image via imageIndex (0-based index of the supplied page images). For "identify the numbered structures" questions use type "image_identify" with imageLabels (id matching the blank id, x/y normalized 0..1). Never invent images not in the source.

9. COMPLETENESS: report "detected" = number of questions found, "converted" = number successfully converted. These should match.`;

    const content: ContentBlock[] = [
      {
        type: "document",
        source: { type: "base64", media_type: data.mediaType, data: data.pdfBase64 },
      },
    ];
    data.images.forEach((im) => {
      content.push({
        type: "image",
        source: { type: "base64", media_type: im.mediaType, data: im.data },
      });
    });
    content.push({
      type: "text",
      text: `Extract all questions from this exam following the rules exactly. Preserve each question's ORIGINAL TYPE and wording — cloze stays cloze, mcq stays mcq, true/false stays truefalse, open questions stay "short" with EMPTY options. For each blank, find the YELLOW-HIGHLIGHTED answer on its page image. For cloze/mcq/matching blanks, build 4-8 randomized scientifically accurate options with one explanation per option. For truefalse blanks use exactly ["True","False"]. For short/open blanks leave options empty.${
        hasImages
          ? " The images after the document are the page renders, indexed from 0 in order — use them to locate the yellow highlight for every question, and reference them via imageIndex when a question uses a figure."
          : " No page images were supplied, so highlight color cannot be checked — leave every question's correct answer as an empty string rather than guessing."
      }`,
    });

    const out = await callAnthropic(key, system, content);
    return {
      questions: out.questions,
      detected: out.detected ?? out.questions.length,
      converted: out.converted ?? out.questions.length,
    };
  });

export const generateImageExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { subject?: string; count?: number; images?: AiImageInput[] }) => {
      const images = sanitizeImages(input.images);
      if (images.length === 0) throw new Error("At least one image is required");
      return {
        subject: String(input.subject ?? "").slice(0, 2000),
        count: Math.min(Math.max(Number(input.count) || images.length, 1), 60),
        images,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const system = `You are a medical school examiner creating IMAGE-BASED exam questions from figures the student uploaded (anatomy diagrams, histology slides, chemical structures). Use ONLY the supplied images — never invent or describe images that are not provided. Images are supplied in order, indexed from 0.

Generate up to ${data.count} questions via the save_questions tool. Use these image question types:

- "image_identify": show the image with numbered markers on distinct structures. Provide imageLabels = one marker per structure (id = "1","2","3"…, x/y normalized 0..1 placed ON the structure). Provide one blank per marker: blank.id equals the marker id, blank.label = "Structure 1" etc., options = plausible structure names (include the correct one), correct = the exact right name. Set imageIndex to the image used.

- "image_matching": match the image to its correct description. One blank; options = candidate descriptions; correct = the right one. Set imageIndex. Optionally omit imageLabels.

- "image_clinical": ask a clinical-reasoning question about a marked structure (e.g. "The structure marked 3 is damaged — what is the clinical outcome?"). Set imageIndex, provide imageLabels for the referenced markers, and one blank with options (the clinical outcomes) and the correct answer.

Rules:
- Every blank / labeled structure is worth 1 point (partial credit).
- Always set imageIndex to a valid index of a supplied image.
- Coordinates must sit on the actual structure in the image.
- Prefer image_identify for clear anatomy/histology figures.`;

    const content: ContentBlock[] = data.images.map((im) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: im.mediaType, data: im.data },
    }));
    content.push({
      type: "text",
      text: `Create image-based questions from the ${data.images.length} image(s) above (indexed from 0).${
        data.subject ? `\nContext / topic: ${data.subject}` : ""
      }`,
    });

    const out = await callAnthropic(key, system, content);
    return { questions: out.questions };
  });

/* ---------- lecture tutor ("Teach me this lecture") ---------- */

export type TutorSection = { id: string; title: string; summary: string };
export type TutorMessage = { role: "tutor" | "user"; content: string };
export type TutorSession = {
  id: string;
  fileId: string;
  sections: TutorSection[];
  currentSection: number;
  messages: TutorMessage[];
  recap: string[] | null;
  completed: boolean;
};

function mapTutorSession(row: {
  id: string;
  file_id: string;
  sections: unknown;
  current_section: number | null;
  messages: unknown;
  recap: unknown;
  completed: boolean | null;
}): TutorSession {
  return {
    id: row.id,
    fileId: row.file_id,
    sections: (row.sections as TutorSection[]) ?? [],
    currentSection: row.current_section ?? 0,
    messages: (row.messages as TutorMessage[]) ?? [],
    recap: (row.recap as string[] | null) ?? null,
    completed: !!row.completed,
  };
}

const MAX_LECTURE_BYTES = 20 * 1024 * 1024;

/** Downloads an uploaded file's content straight from Storage on the server (using the
 *  caller's own authenticated client, so the same RLS/ownership rules apply as client-side)
 *  and base64-encodes it — reused on every tutor turn since Claude calls are stateless. */
async function fetchFileDocument(
  supabase: any,
  userId: string,
  fileId: string,
): Promise<{ data: string; mediaType: string; name: string }> {
  const { data: file } = await supabase
    .from("files")
    .select("name, storage_path, mime_type")
    .eq("id", fileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!file?.storage_path) {
    throw new Error("This file has no saved content to teach from.");
  }
  const { data: blob, error } = await supabase.storage.from("materials").download(file.storage_path);
  if (error || !blob) {
    throw new Error(`Could not read the file: ${error?.message ?? "unknown error"}`);
  }
  if (blob.size > MAX_LECTURE_BYTES) {
    throw new Error(
      `This file exceeds the ${(MAX_LECTURE_BYTES / 1024 / 1024).toFixed(0)}MB limit for the tutor.`,
    );
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType: file.mime_type || "application/pdf", name: file.name };
}

/** Generic schema-constrained Anthropic call, shared by the two tutor endpoints below
 *  (mirrors callAnthropic/callAnthropicNotes but generic over the tool's return shape so a
 *  third near-identical fetch/error-handling block doesn't need to exist). */
async function callAnthropicTool<T>(
  apiKey: string,
  system: string,
  content: ContentBlock[],
  tool: { name: string; description: string; schema: Record<string, unknown> },
  maxTokens: number,
): Promise<T> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
      tool_choice: { type: "tool", name: tool.name },
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

  const json = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const toolUse = json.content?.find((c) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("The tutor returned no response.");
  return toolUse.input as T;
}

const TUTOR_CONTRACT = `You are a patient, expert private tutor teaching a medical student one lecture, one small section at a time. Follow these rules on every message, without exception:

1. Teach ONE small, digestible section at a time — never dump the whole lecture at once.
2. For the section's content: first explain the core concept simply and plainly. THEN add the details and small facts (exact numbers, exceptions, named things) that are easy to forget — and explicitly flag every single one on its own line as "⚠️ Easy to forget — likely on the exam: <the fact>".
3. For the hard-to-remember details, give a genuinely useful memory aid — a mnemonic, an analogy, or a short "how to remember this" tip.
4. After teaching a section, ask exactly 1-2 short questions that check REAL understanding of that section (not yes/no trivia). Do not advance to the next section until the student has answered acceptably — if their answer is wrong or shows a misunderstanding, re-explain the SAME point a different way (a different analogy or example, not just the same words again), then re-ask.
5. The student can ask anything at any time — "explain again", "why?", "give me another example", or an unrelated question. Answer it directly and helpfully, and do NOT advance to the next section just because they asked something; only advance once they've actually demonstrated understanding of the CURRENT section's check question(s).
6. Zero omission: across the whole lecture, every concept, fact, number, exception and name from the source material must eventually be taught — never silently skip something because it seems minor.
7. When the student passes the check question(s) for the LAST section, end the session: write a compact "what to remember" recap covering every key point AND every flagged easy-to-forget detail from the entire lecture, and signal completion.
8. Never invent facts that are not in the supplied lecture document.`;

const tutorStartSchema = {
  type: "object" as const,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          summary: {
            type: "string",
            description:
              "What this section covers, in enough detail that a later step can teach strictly from this scope alone.",
          },
        },
        required: ["id", "title", "summary"],
      },
    },
    firstMessage: {
      type: "string",
      description: "The full teaching message for section 1 only, following the tutoring rules.",
    },
  },
  required: ["sections", "firstMessage"],
};

const tutorTurnSchema = {
  type: "object" as const,
  properties: {
    reply: { type: "string" },
    advanceSection: {
      type: "boolean",
      description:
        "True only if the student has just demonstrated understanding of the CURRENT section's check question(s) and it's time to move on.",
    },
    sessionComplete: {
      type: "boolean",
      description: "True only when the student has just passed the check question(s) for the LAST section.",
    },
    recap: {
      type: "array",
      items: { type: "string" },
      description:
        "Only when sessionComplete is true: a compact 'what to remember' list covering every key point and every flagged easy-to-forget detail from the whole lecture.",
    },
  },
  required: ["reply", "advanceSection", "sessionComplete"],
};

export const startLectureTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (typeof input?.fileId !== "string" || !input.fileId) throw new Error("A file is required");
    return { fileId: input.fileId };
  })
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const { data: existing } = await context.supabase
      .from("lecture_tutor_sessions")
      .select("*")
      .eq("user_id", context.userId)
      .eq("file_id", data.fileId)
      .maybeSingle();
    if (existing) return mapTutorSession(existing);

    const file = await fetchFileDocument(context.supabase, context.userId, data.fileId);

    const content: ContentBlock[] = [
      {
        type: "document",
        source: { type: "base64", media_type: file.mediaType, data: file.data },
      },
      {
        type: "text",
        text: `Lecture file: "${file.name}". Build the section outline and teach the first section now.`,
      },
    ];

    const out = await callAnthropicTool<{ sections: TutorSection[]; firstMessage: string }>(
      key,
      `${TUTOR_CONTRACT}

For THIS message only: read the entire attached lecture document and split it into an ordered list of small, digestible sections that together cover the ENTIRE document with zero omission — every concept, fact, number, exception, and name must be assigned to exactly one section. Sections should be genuinely small (a student should absorb one in a few minutes), so a typical lecture becomes somewhere between 4 and 15 sections depending on length and density — never merge unrelated content just to make fewer sections, and never make a section so broad it stops being "one small piece at a time."

Then, following rules 2-4 above, write out the FULL teaching message for the FIRST section only. Do not teach any other section yet.`,
      content,
      {
        name: "save_tutor_start",
        description: "Save the lecture's section outline and the first section's teaching message.",
        schema: tutorStartSchema,
      },
      16000,
    );
    if (!out.sections?.length || !out.firstMessage) {
      throw new Error("The tutor could not process this lecture. Try again.");
    }

    const { data: inserted, error } = await context.supabase
      .from("lecture_tutor_sessions")
      .insert({
        user_id: context.userId,
        file_id: data.fileId,
        sections: out.sections,
        current_section: 0,
        messages: [{ role: "tutor", content: out.firstMessage }],
      })
      .select()
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Could not start the tutor session.");
    return mapTutorSession(inserted);
  });

export const continueLectureTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string; message: string }) => {
    if (typeof input?.sessionId !== "string" || !input.sessionId) {
      throw new Error("A tutor session is required");
    }
    const message = String(input?.message ?? "").trim();
    if (!message) throw new Error("Type a message first");
    return { sessionId: input.sessionId, message: message.slice(0, 4000) };
  })
  .handler(async ({ data, context }) => {
    const key = await getKey(context.supabase, context.userId);
    if (!key) throw new Error("AI features require an API key.");

    const { data: session } = await context.supabase
      .from("lecture_tutor_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!session) throw new Error("Tutor session not found");
    if (session.completed) throw new Error("This lecture is already complete.");

    const sections = (session.sections as TutorSection[]) ?? [];
    const messages = (session.messages as TutorMessage[]) ?? [];
    const currentSection = session.current_section ?? 0;

    const file = await fetchFileDocument(context.supabase, context.userId, session.file_id);

    const outline = sections
      .map((s, i) => `${i + 1}. ${s.title}${i === currentSection ? " (CURRENT SECTION)" : ""} — ${s.summary}`)
      .join("\n");
    const transcript = messages
      .slice(-40)
      .map((m) => `${m.role === "tutor" ? "Tutor" : "Student"}: ${m.content}`)
      .join("\n\n");

    const system = `${TUTOR_CONTRACT}

Full section outline for this lecture (for your own tracking — teach naturally, don't just read this list aloud):
${outline}

You are currently on section ${currentSection + 1} of ${sections.length}: "${sections[currentSection]?.title ?? ""}".

Conversation so far:
${transcript}`;

    const content: ContentBlock[] = [
      {
        type: "document",
        source: { type: "base64", media_type: file.mediaType, data: file.data },
        // Same lecture document is resent on every turn of this session (Claude calls are
        // stateless) — cache it so a long back-and-forth doesn't reprocess it from scratch
        // each time.
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: `Student's new message: "${data.message}"\n\nRespond as the tutor, following the rules.`,
      },
    ];

    const out = await callAnthropicTool<{
      reply: string;
      advanceSection: boolean;
      sessionComplete: boolean;
      recap?: string[] | null;
    }>(
      key,
      system,
      content,
      {
        name: "save_tutor_turn",
        description: "Save the tutor's reply and this turn's session-progress signals.",
        schema: tutorTurnSchema,
      },
      8000,
    );

    const nextMessages: TutorMessage[] = [
      ...messages,
      { role: "user", content: data.message },
      { role: "tutor", content: out.reply },
    ];
    const nextSection = out.advanceSection ? Math.min(currentSection + 1, sections.length - 1) : currentSection;
    const completed = !!out.sessionComplete;

    const { data: updated, error } = await context.supabase
      .from("lecture_tutor_sessions")
      .update({
        messages: nextMessages,
        current_section: nextSection,
        completed,
        recap: completed ? (out.recap ?? []) : session.recap,
      })
      .eq("id", data.sessionId)
      .select()
      .single();
    if (error || !updated) throw new Error(error?.message ?? "Could not save your progress.");
    return mapTutorSession(updated);
  });
