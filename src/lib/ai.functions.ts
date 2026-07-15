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
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

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
      // Generous headroom: a single exam can have 50-100+ blanks, and rule 4 below
      // requires 4-8 full options plus one explanation sentence per option for EACH
      // blank — that easily exceeds 8000 tokens and previously caused the model to
      // silently degrade to a single option per blank to fit the budget.
      max_tokens: 64000,
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
    const system = `You convert an EXISTING exam PDF into an interactive practice exam that is AS CLOSE AS POSSIBLE to the original. The only thing you add is answer choices for each missing word/phrase — you do not rewrite, restructure, or simplify anything else. CRITICAL RULES — follow exactly:

1. REPRODUCE THE QUESTION/PASSAGE EXACTLY: copy every question, passage and surrounding text EXACTLY as written. Do NOT reword, translate, fix grammar, "improve", normalize, or restructure the wording — change it only if absolutely unavoidable to represent a blank (rule 2). Keep original typos, punctuation, casing and spacing.

2. A MISSING WORD/PHRASE STAYS A CLOZE BLANK — THIS IS THE DEFAULT: if the original question has a gap (a blank line, underline, ellipsis, bracket, or similar missing word/phrase within a sentence or passage), you MUST preserve that exact structure as a "cloze" question. Keep the surrounding sentence/passage text EXACTLY as in the source, and replace ONLY the missing word/phrase with a token [[1]], [[2]], … in reading order (one token per blank). Do NOT reveal the answer in the passage text, and do NOT turn the passage into a differently-worded standalone question. A passage can contain multiple blanks — keep them all as ONE "cloze" question; never split a passage into separate questions.
   - Use "mcq" ONLY when the source itself already presents a standalone question with its own visible answer options (a genuine multiple-choice question, not a fill-in-the-blank) — and even then, copy the stem exactly as rule 1 requires.
   - Use "matching"/"truefalse"/"short" only when the source is unambiguously that format.

3. CORRECT ANSWER SOURCE — VISUAL, FROM THE PAGE IMAGE: this is the single most important rule. The rasterized page images supplied after the document are REQUIRED grading input, not optional illustration. For each blank/question, look at its page image and find the YELLOW-HIGHLIGHTED answer in the answer box/key (often at the bottom of the page or exam) — a yellow marker/highlighter box or fill over the correct word, phrase, or option. That highlighted text is the correct answer, copied EXACTLY as highlighted.
   - NEVER use a bracketed "[X]" text line as the answer source.
   - NEVER use a student's circled answer, checkmark, handwritten mark, or any non-yellow annotation — those may be WRONG (a student's mistake) and must be ignored as answer signals.
   - NEVER guess the correct answer from your own knowledge of the subject.
   - If a blank genuinely has no yellow highlight visible anywhere, leave its "correct" as an empty string rather than guessing.

4. GIVE EVERY BLANK 4-8 OPTIONS — NO EXCEPTIONS, EVEN IN LARGE EXAMS: for each blank — whether it's a cloze token or an mcq's single blank — build a set of 4 to 8 multiple-choice options: the real answer (from the yellow highlight, worded EXACTLY as highlighted) plus realistic distractors to fill out the set. A blank whose options[] has fewer than 4 entries (e.g. just the correct answer alone) is INVALID OUTPUT — this rule applies identically whether the exam has 5 blanks or 100; never shorten, skip, or thin out distractors/explanations to save space or move faster. You have a large output budget — use it. Distractors must be:
   - Scientifically/medically ACCURATE as statements in their own right (a true fact about a related-but-wrong concept), not fabricated nonsense — the error must be that they don't answer THIS blank, not that they're false in general.
   - Plausible and topic-relevant — something a student who half-understands the material could believably pick — never an obviously-wrong throwaway option.
   - Distinct from each other and from the correct answer — no near-duplicates, no options trivially eliminable by wording alone.
   - Matched in length/register to the real answer so it doesn't visually stand out.
   - If the source already shows 4-8 options for that blank, keep the real ones as written and add distractors only if truly short of 4.

5. PER-BLANK EXPLANATIONS — REQUIRED, even though the source has none, for EVERY blank in the exam with no exceptions for large exams: for every blank, fill blanks[].explanations[] with exactly one entry per option, in the SAME ORDER as that blank's options[]. Each entry is 1-2 sentences of accurate rationale for why that specific option is correct or incorrect for this blank. Write these yourself from your medical knowledge — this is the one place you add content beyond pure transcription, and it must be scientifically accurate. Do not omit explanations for later questions to save space — every blank gets them, from the first question to the last.

6. RANDOMIZE OPTION ORDER PER BLANK: list each blank's options[] (and its matching explanations[], kept in the same order) in randomized order — not answer-first, not source order — so the correct answer isn't always in the same position. This is safe: grading matches by value, not position.

7. PARTIAL CREDIT: each blank counts as 1 point, so include every blank in a passage-style question.

8. Non-cloze/non-mcq formats (rare): "matching" (one blank per item, label = item, options = candidate descriptions), "truefalse" (one blank per statement, label = statement, options ["True","False"]) — only when the source is unambiguously that format. NEVER use type "short" and NEVER leave a blank's options[] empty — every single blank in the exam, with zero exceptions, gets 4-8 options per rule 4. If a blank looks like open-ended free text in the source, it still gets converted into a 4-8-option choice using rule 4's process.

9. IMAGES: if a question refers to a figure/diagram shown in the material, KEEP the image. Page images are supplied in order starting at index 0. Set imageIndex to the index of the page image that contains the figure for that question. When the original question asks to identify numbered structures on the figure, use type "image_identify" and supply imageLabels (id must match the blank id, x/y normalized 0..1). Never invent images that are not in the source.

10. COMPLETENESS: report "detected" = number of questions found in the document, and "converted" = number successfully converted with a usable structure. These should match when everything converts.`;

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
      text: `Extract all questions from this exam following the rules exactly. Preserve every fill-in-the-blank passage exactly as written — do not rewrite it into a standalone question. For each blank, find the YELLOW-HIGHLIGHTED answer on its page image — that is the only valid source for the correct answer — then build out 4-8 randomized, scientifically accurate options for that blank with one explanation per option covering why it's right or wrong.${
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
