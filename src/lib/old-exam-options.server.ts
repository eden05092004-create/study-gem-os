const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

type AiBlankLike = {
  id: string;
  label?: string;
  options: string[];
  correct: string;
  explanations?: string[];
};

type AiQuestionLike = {
  type: string;
  text: string;
  blanks: AiBlankLike[];
  explanations?: string[];
  imageIndex?: number;
  imageLabels?: { id: string; x: number; y: number }[];
};

type OptionRequest = {
  questionIndex: number;
  questionType: string;
  questionText: string;
  blankId: string;
  blankLabel?: string;
  correct: string;
  existingOptions: string[];
};

type OptionSet = {
  questionIndex: number;
  blankId: string;
  options: string[];
  /** one explanation per option, same order as options[] */
  explanations: string[];
};

const optionSchema = {
  type: "object" as const,
  properties: {
    optionSets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionIndex: { type: "number" },
          blankId: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          explanations: {
            type: "array",
            items: { type: "string" },
            description: "One entry per option, same order as options[] — why each is correct or incorrect.",
          },
        },
        required: ["questionIndex", "blankId", "options", "explanations"],
      },
    },
  },
  required: ["optionSets"],
};

function comparable(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A blank only needs backfilling if it doesn't already satisfy rule 4 (4-8 options,
 *  the correct answer present exactly once) — anything already valid is left completely
 *  untouched so its existing options AND their paired per-option explanations survive as-is. */
function isValidBlank(blank: AiBlankLike): boolean {
  const correct = blank.correct?.trim();
  if (!correct) return true; // nothing to check/backfill without a correct answer
  const correctCount = blank.options.filter((o) => comparable(o) === comparable(correct)).length;
  return blank.options.length >= 4 && blank.options.length <= 8 && correctCount === 1;
}

function keepPaired(options: string[], explanations: string[]) {
  const seen = new Set<string>();
  const pairs: { option: string; explanation: string }[] = [];
  options.forEach((option, i) => {
    const cleaned = option.trim();
    if (!cleaned) return;
    const key = comparable(cleaned);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ option: cleaned, explanation: explanations[i] ?? "" });
  });
  return pairs;
}

function shufflePairs<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Builds the final options[]/explanations[] pair for one blank, keeping every option's
 *  explanation attached to it through de-duplication and shuffling. */
function finalizeOptions(
  correct: string,
  generatedOptions: string[],
  generatedExplanations: string[],
): { options: string[]; explanations: string[] } {
  const exactCorrect = correct.trim();
  if (!exactCorrect) return { options: [], explanations: [] };

  const pairs = keepPaired(generatedOptions, generatedExplanations).filter(
    (p) => comparable(p.option) !== comparable(exactCorrect),
  );
  const correctExplanation =
    generatedExplanations[generatedOptions.findIndex((o) => comparable(o) === comparable(exactCorrect))] ?? "";
  const shuffled = shufflePairs([{ option: exactCorrect, explanation: correctExplanation }, ...pairs.slice(0, 7)]);
  return { options: shuffled.map((p) => p.option), explanations: shuffled.map((p) => p.explanation) };
}

function collectRequests(questions: AiQuestionLike[]) {
  const requests: OptionRequest[] = [];
  questions.forEach((question, questionIndex) => {
    question.blanks.forEach((blank) => {
      const correct = String(blank.correct ?? "").trim();
      if (!correct || isValidBlank(blank)) return;
      requests.push({
        questionIndex,
        questionType: question.type,
        questionText: question.text,
        blankId: blank.id,
        blankLabel: blank.label,
        correct,
        existingOptions: Array.isArray(blank.options) ? blank.options : [],
      });
    });
  });
  return requests;
}

async function requestOptionSets(apiKey: string, requests: OptionRequest[]) {
  const system = `You are a medical school exam editor. Your only job is to create realistic multiple-choice dropdown options — and per-option explanations — for already-extracted exam blanks that are missing them.

Rules:
- Return one option set for EVERY requested blank.
- Each option set must contain 4 to 8 total options.
- Include the provided correct answer EXACTLY once, character-for-character. Never rewrite it.
- The correct answer is already extracted from the exam answer box. Do not change it, infer a different answer, or add another correct answer.
- All other options must be plausible, scientifically accurate distractors from the same subject/category and similar style/length.
- Avoid joke options, obviously wrong options, duplicates, "all of the above", and "none of the above".
- If existing options are provided, you may reuse scientifically valid distractors, but still return 4 to 8 total options.
- explanations[] must have exactly one entry per option, same order as options[], each a 1-2 sentence accurate rationale for why that option is correct or incorrect.`;

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
          name: "save_option_sets",
          description: "Save multiple-choice options and per-option explanations for extracted exam blanks.",
          input_schema: optionSchema,
        },
      ],
      tool_choice: { type: "tool", name: "save_option_sets" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create 4-8 answer choices (with explanations) for each blank below. Return only via the tool.\n${JSON.stringify(
                requests,
              )}`,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not generate answer choices (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const toolUse = json.content?.find((c) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("The AI returned no answer choices.");
  const input = toolUse.input as { optionSets?: OptionSet[] };
  return input.optionSets ?? [];
}

/** Backfills any blank that doesn't already have a valid 4-8-option set with exactly one
 *  correct answer — used as a deterministic safety net after the main extraction call.
 *  Blanks that are already valid are left completely untouched (options AND their paired
 *  per-option explanations survive verbatim) so this never scrambles good data. */
export async function ensureOldExamOptions<T extends AiQuestionLike>(
  apiKey: string,
  questions: T[],
): Promise<T[]> {
  const requests = collectRequests(questions);
  if (requests.length === 0) return questions;

  const optionSets = await requestOptionSets(apiKey, requests);
  const byBlank = new Map<string, { options: string[]; explanations: string[] }>();
  optionSets.forEach((set) => {
    byBlank.set(`${set.questionIndex}:${set.blankId}`, {
      options: Array.isArray(set.options) ? set.options : [],
      explanations: Array.isArray(set.explanations) ? set.explanations : [],
    });
  });

  const enriched = questions.map((question, questionIndex) => ({
    ...question,
    blanks: question.blanks.map((blank) => {
      if (isValidBlank(blank)) return blank; // untouched — no backfill needed
      const generated = byBlank.get(`${questionIndex}:${blank.id}`) ?? {
        options: blank.options ?? [],
        explanations: blank.explanations ?? [],
      };
      const { options, explanations } = finalizeOptions(blank.correct, generated.options, generated.explanations);
      return { ...blank, options, explanations };
    }),
  }));

  const invalid = enriched.flatMap((question, questionIndex) =>
    question.blanks
      .filter((blank) => blank.correct.trim() && !isValidBlank(blank))
      .map((blank) => `Q${questionIndex + 1} blank ${blank.id}`),
  );

  if (invalid.length > 0) {
    throw new Error(
      `Could not create 4-8 valid answer choices for: ${invalid.slice(0, 6).join(", ")}. Please retry conversion.`,
    );
  }

  return enriched as T[];
}
