const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

type AiBlankLike = {
  id: string;
  label?: string;
  options: string[];
  correct: string;
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
        },
        required: ["questionIndex", "blankId", "options"],
      },
    },
  },
  required: ["optionSets"],
};

function comparable(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function keepUnique(options: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const option of options) {
    const cleaned = option.trim();
    if (!cleaned) continue;
    const key = comparable(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }
  return unique;
}

function shuffle<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function finalizeOptions(correct: string, generated: string[]) {
  const exactCorrect = correct.trim();
  if (!exactCorrect) return [];

  const withoutCorrect = keepUnique(generated).filter(
    (option) => comparable(option) !== comparable(exactCorrect),
  );
  const selectedDistractors = withoutCorrect.slice(0, 7);
  return shuffle([exactCorrect, ...selectedDistractors]);
}

function collectRequests(questions: AiQuestionLike[]) {
  const requests: OptionRequest[] = [];
  questions.forEach((question, questionIndex) => {
    question.blanks.forEach((blank) => {
      const correct = String(blank.correct ?? "").trim();
      if (!correct) return;
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
  const system = `You are a medical school exam editor. Your only job is to create realistic multiple-choice dropdown options for already-extracted exam blanks.

Rules:
- Return one option set for EVERY requested blank.
- Each option set must contain 4 to 8 total options.
- Include the provided correct answer EXACTLY once, character-for-character. Never rewrite it.
- The correct answer is already extracted from the exam answer box. Do not change it, infer a different answer, or add another correct answer.
- All other options must be plausible, scientifically accurate distractors from the same subject/category and similar style/length.
- Avoid joke options, obviously wrong options, duplicates, "all of the above", and "none of the above".
- If existing options are provided, you may reuse scientifically valid distractors, but still return 4 to 8 total options.`;

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
          name: "save_option_sets",
          description: "Save multiple-choice options for extracted exam blanks.",
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
              text: `Create 4-8 answer choices for each blank below. Return only via the tool.\n${JSON.stringify(
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

export async function ensureOldExamOptions<T extends AiQuestionLike>(
  apiKey: string,
  questions: T[],
): Promise<T[]> {
  const requests = collectRequests(questions);
  if (requests.length === 0) return questions;

  const optionSets = await requestOptionSets(apiKey, requests);
  const byBlank = new Map<string, string[]>();
  optionSets.forEach((set) => {
    byBlank.set(`${set.questionIndex}:${set.blankId}`, Array.isArray(set.options) ? set.options : []);
  });

  const enriched = questions.map((question, questionIndex) => ({
    ...question,
    blanks: question.blanks.map((blank) => {
      const generated = byBlank.get(`${questionIndex}:${blank.id}`) ?? blank.options ?? [];
      const options = finalizeOptions(blank.correct, generated);
      return { ...blank, options };
    }),
  }));

  const invalid = enriched.flatMap((question, questionIndex) =>
    question.blanks
      .filter((blank) => {
        const correctCount = blank.options.filter(
          (option) => comparable(option) === comparable(blank.correct),
        ).length;
        return blank.correct.trim() && (blank.options.length < 4 || blank.options.length > 8 || correctCount !== 1);
      })
      .map((blank) => `Q${questionIndex + 1} blank ${blank.id}`),
  );

  if (invalid.length > 0) {
    throw new Error(
      `Could not create 4-8 valid answer choices for: ${invalid.slice(0, 6).join(", ")}. Please retry conversion.`,
    );
  }

  return enriched as T[];
}