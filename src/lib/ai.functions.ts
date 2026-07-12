import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

export type AiBlank = {
  id: string;
  label?: string;
  options: string[];
  correct: string;
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
    const system = `You transcribe an EXISTING exam PDF/document into structured questions for an interactive exam engine. CRITICAL RULES — follow exactly:

1. REPRODUCE EXACTLY: copy every question, passage and answer option EXACTLY as written. Do NOT reword, translate, fix grammar, "improve", or normalize anything. Keep original typos, punctuation, casing and spacing.

2. CLOZE IS THE DEFAULT: most questions are CLOZE — a single passage containing MULTIPLE blanks, each blank rendered as a dropdown. Keep the whole passage intact as ONE question of type "cloze". Do NOT split a multi-blank passage into several separate questions. In the passage "text", replace each blank with a token [[1]], [[2]], [[3]] … in reading order. Create one entry in blanks[] per token, with id equal to the token number ("1", "2", …), options = the exact dropdown choices for that blank, and correct = the exact bracketed correct answer for that blank.

3. CORRECT ANSWERS SOURCE: the correct answer for a blank/question is taken ONLY from the text in square brackets on a line reading "The correct answer is:" (e.g. "The correct answer is: [X]"). For a passage with multiple blanks these appear in order — map them to the blanks in the same order. NEVER infer the correct answer from what the student selected, from highlighting, or from your own knowledge. If no "The correct answer is:" line exists for a blank, leave its correct as an empty string.

4. PARTIAL CREDIT: each blank counts as 1 point, so include every blank in a passage.

5. Other formats: use "matching" (one blank per item, label = item, options = candidate descriptions), "truefalse" (one blank per statement, label = statement, options ["True","False"]), "short" (one blank, empty options, correct = accepted answer), or "mcq" only for a standalone single-answer multiple-choice question (one blank, options = choices).

6. IMAGES: if a question refers to a figure/diagram shown in the material, KEEP the image. After the document, page images are supplied in order starting at index 0. Set imageIndex to the index of the page image that contains the figure for that question, and keep the question's normal type/blanks. When the original question asks to identify numbered structures on the figure, use type "image_identify" and supply imageLabels (id must match the blank id, x/y normalized 0..1). Never invent images that are not in the source.

7. COMPLETENESS: report "detected" = number of questions found in the document, and "converted" = number successfully converted with a usable structure. These should match when everything converts.`;

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
      text: `Extract all questions from this exam following the rules exactly. Remember: correct answers come only from the "The correct answer is: [...]" lines.${
        hasImages
          ? " The images after the document are the page renders, indexed from 0 in order; reference them via imageIndex when a question uses a figure."
          : ""
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
