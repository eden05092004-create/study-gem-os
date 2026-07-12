import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

export type FileItem = {
  id: string;
  name: string;
  kind: "pdf" | "ppt" | "word" | "image";
  size: string;
  addedAt: string;
};

export type NoteSection = {
  key: string;
  title: string;
  icon: string;
  body: string;
};

export type Note = {
  id: string;
  title: string;
  updatedAt: string;
  sections: NoteSection[];
};

export type QuestionType =
  | "mcq"
  | "cloze"
  | "matching"
  | "truefalse"
  | "short"
  | "image_identify"
  | "image_matching"
  | "image_clinical";

/** A single gradable unit inside a question (worth 1 point) */
export type Blank = {
  id: string;
  /** label shown before the dropdown (matching item / true-false statement) */
  label?: string;
  /** dropdown options; empty for short answer */
  options: string[];
  /** correct option value, or the accepted answer for short answer */
  correct: string;
};

/** A numbered marker overlaid on a question image (coords normalized 0..1) */
export type ImageLabel = {
  id: string;
  x: number;
  y: number;
};

export type Question = {
  id: string;
  type: QuestionType;
  /** prompt; for cloze this is the passage containing [[id]] tokens */
  text: string;
  blanks: Blank[];
  /** per-option explanation, only used for mcq review */
  explanations: string[];
  /** image shown inside the question (data URL) for image_* types */
  imageUrl?: string;
  /** numbered markers placed on the image; id matches a blank id */
  imageLabels?: ImageLabel[];
};

export type Exam = {
  id: string;
  title: string;
  durationMin: number;
  questions: Question[];
};

export type Lecture = {
  id: string;
  number: string;
  name: string;
};

export type Topic = {
  id: string;
  name: string;
  files: FileItem[];
  notes: Note[];
  exams: Exam[];
  lectures: Lecture[];
};

export type Course = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  topics: Topic[];
};

export type MistakeEntry = {
  id: string;
  courseId: string;
  courseName: string;
  topicId: string;
  examId: string;
  question: Question;
  blankId: string;
  blankLabel: string;
  questionText: string;
  chosenValue: string;
  correctValue: string;
  date: string;
};

/* ---------- grading helpers ---------- */

export function normalizeShort(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isBlankCorrect(
  blank: Blank,
  value: string | undefined,
  type: QuestionType,
) {
  if (value === undefined || value === "") return false;
  // free-text comparison for short answer, or any blank without dropdown options
  if (type === "short" || blank.options.length === 0)
    return normalizeShort(value) === normalizeShort(blank.correct);
  return value === blank.correct;
}

export type QuestionGrade = {
  total: number;
  earned: number;
  perBlank: { blank: Blank; value: string | undefined; correct: boolean }[];
  status: "correct" | "partial" | "incorrect";
};

export function gradeQuestion(
  q: Question,
  answers: Record<string, string>,
): QuestionGrade {
  const perBlank = q.blanks.map((blank) => {
    const value = answers[`${q.id}:${blank.id}`];
    return { blank, value, correct: isBlankCorrect(blank, value, q.type) };
  });
  const earned = perBlank.filter((b) => b.correct).length;
  const total = q.blanks.length || 1;
  const status: QuestionGrade["status"] =
    earned === total ? "correct" : earned === 0 ? "incorrect" : "partial";
  return { total, earned, perBlank, status };
}

const EMOJIS = ["📘", "📗", "📙", "📕", "🧪", "💊", "🦴", "❤️"];
const COLORS = ["190", "60", "155", "22"];

/* ---------- store ---------- */

export type NewQuestion = {
  type: QuestionType;
  text: string;
  blanks: Blank[];
  explanations?: string[];
  imageUrl?: string;
  imageLabels?: ImageLabel[];
};

type State = {
  userName: string;
  userEmail: string;
  studyHoursToday: number;
  questionsSolved: number;
  nextExamDate: string;
  courses: Course[];
  mistakes: MistakeEntry[];
  loading: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  reset: () => void;
  addCourse: (name: string, emoji: string) => Promise<void>;
  addTopic: (courseId: string, name: string) => Promise<void>;
  addFile: (
    courseId: string,
    topicId: string,
    file: Omit<FileItem, "id">,
  ) => Promise<void>;
  createExam: (
    courseId: string,
    topicId: string,
    title: string,
    durationMin: number,
    questions: NewQuestion[],
  ) => Promise<void>;
  addNote: (
    courseId: string,
    topicId: string,
    title: string,
    sections: NoteSection[],
  ) => Promise<string | null>;
  recordExamResult: (
    courseId: string,
    topicId: string,
    examId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  clearMistakes: () => Promise<void>;
  deleteMistake: (id: string) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  deleteTopic: (courseId: string, topicId: string) => Promise<void>;
  deleteFile: (courseId: string, topicId: string, fileId: string) => Promise<void>;
  deleteExam: (courseId: string, topicId: string, examId: string) => Promise<void>;
  deleteNote: (courseId: string, topicId: string, noteId: string) => Promise<void>;
  updateNote: (
    courseId: string,
    topicId: string,
    noteId: string,
    title: string,
    sections: NoteSection[],
  ) => Promise<void>;
};

function mapQuestion(q: {
  id: string;
  type: string | null;
  text: string;
  options: unknown;
  correct_index: number | null;
  blanks: unknown;
  explanations: unknown;
  image_url?: string | null;
  image_labels?: unknown;
}): Question {
  const type = (q.type as QuestionType) ?? "mcq";
  let blanks = (q.blanks as Blank[]) ?? [];
  if (!blanks || blanks.length === 0) {
    // legacy mcq without blanks — synthesize a single blank
    const opts = (q.options as string[]) ?? [];
    blanks = [
      {
        id: "b1",
        options: opts,
        correct: opts[q.correct_index ?? 0] ?? "",
      },
    ];
  }
  return {
    id: q.id,
    type,
    text: q.text,
    blanks,
    explanations: (q.explanations as string[]) ?? [],
    imageUrl: q.image_url ?? undefined,
    imageLabels: (q.image_labels as ImageLabel[]) ?? [],
  };
}

async function loadAll() {
  const [
    coursesRes,
    topicsRes,
    filesRes,
    notesRes,
    examsRes,
    questionsRes,
    mistakesRes,
    answersRes,
    lecturesRes,
  ] = await Promise.all([
    supabase.from("courses").select("*").order("created_at"),
    supabase.from("topics").select("*").order("created_at"),
    supabase.from("files").select("*").order("created_at"),
    supabase.from("notes").select("*").order("created_at"),
    supabase.from("exams").select("*").order("created_at"),
    supabase.from("questions").select("*").order("position"),
    supabase.from("mistakes").select("*").order("created_at"),
    supabase.from("answers").select("id"),
    supabase.from("lectures").select("*").order("position"),
  ]);

  const lecturesByTopic = new Map<string, Lecture[]>();
  for (const l of lecturesRes.data ?? []) {
    const arr = lecturesByTopic.get(l.topic_id) ?? [];
    arr.push({ id: l.id, number: l.number, name: l.name });
    lecturesByTopic.set(l.topic_id, arr);
  }


  const questions = questionsRes.data ?? [];
  const questionMap = new Map<string, Question>();
  const questionsByExam = new Map<string, Question[]>();
  for (const q of questions) {
    const question = mapQuestion(q);
    questionMap.set(q.id, question);
    const arr = questionsByExam.get(q.exam_id) ?? [];
    arr.push(question);
    questionsByExam.set(q.exam_id, arr);
  }

  const examsByTopic = new Map<string, Exam[]>();
  for (const e of examsRes.data ?? []) {
    const arr = examsByTopic.get(e.topic_id) ?? [];
    arr.push({
      id: e.id,
      title: e.title,
      durationMin: e.duration_min,
      questions: questionsByExam.get(e.id) ?? [],
    });
    examsByTopic.set(e.topic_id, arr);
  }

  const filesByTopic = new Map<string, FileItem[]>();
  for (const f of filesRes.data ?? []) {
    const arr = filesByTopic.get(f.topic_id) ?? [];
    arr.push({
      id: f.id,
      name: f.name,
      kind: f.kind as FileItem["kind"],
      size: f.size,
      addedAt: f.added_at,
    });
    filesByTopic.set(f.topic_id, arr);
  }

  const notesByTopic = new Map<string, Note[]>();
  for (const n of notesRes.data ?? []) {
    const arr = notesByTopic.get(n.topic_id) ?? [];
    arr.push({
      id: n.id,
      title: n.title,
      updatedAt: n.updated_at,
      sections: (n.sections as NoteSection[]) ?? [],
    });
    notesByTopic.set(n.topic_id, arr);
  }

  const topicsByCourse = new Map<string, Topic[]>();
  for (const t of topicsRes.data ?? []) {
    const arr = topicsByCourse.get(t.course_id) ?? [];
    arr.push({
      id: t.id,
      name: t.name,
      files: filesByTopic.get(t.id) ?? [],
      notes: notesByTopic.get(t.id) ?? [],
      exams: examsByTopic.get(t.id) ?? [],
      lectures: lecturesByTopic.get(t.id) ?? [],
    });
    topicsByCourse.set(t.course_id, arr);
  }

  const courses: Course[] = (coursesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    topics: topicsByCourse.get(c.id) ?? [],
  }));

  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));

  const mistakes: MistakeEntry[] = (mistakesRes.data ?? [])
    .filter((m) => questionMap.has(m.question_id))
    .map((m) => ({
      id: m.id,
      courseId: m.course_id,
      courseName: courseNameById.get(m.course_id) ?? "",
      topicId: m.topic_id,
      examId: m.exam_id,
      question: questionMap.get(m.question_id)!,
      blankId: m.blank_id ?? "",
      blankLabel: m.blank_label ?? "",
      questionText: m.question_text ?? questionMap.get(m.question_id)!.text,
      chosenValue: m.chosen_value ?? "",
      correctValue: m.correct_value ?? "",
      date: "Today",
    }));

  return {
    courses,
    mistakes,
    questionsSolved: answersRes.data?.length ?? 0,
  };
}

export const useStore = create<State>((set, get) => ({
  userName: "",
  userEmail: "",
  studyHoursToday: 0,
  questionsSolved: 0,
  nextExamDate: new Date(Date.now() + 6 * 86400000).toISOString(),
  courses: [],
  mistakes: [],
  loading: false,
  initialized: false,

  init: async () => {
    set({ loading: true });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      set({ loading: false, initialized: true });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const loaded = await loadAll();
    set({
      userName: profile?.display_name ?? user.email?.split("@")[0] ?? "Student",
      userEmail: user.email ?? "",
      ...loaded,
      loading: false,
      initialized: true,
    });
  },

  reset: () =>
    set({
      userName: "",
      userEmail: "",
      courses: [],
      mistakes: [],
      questionsSolved: 0,
      initialized: false,
      loading: false,
    }),

  addCourse: async (name, emoji) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    const s = get();
    const { data } = await supabase
      .from("courses")
      .insert({
        user_id: user.id,
        name,
        emoji: emoji || EMOJIS[s.courses.length % EMOJIS.length],
        color: COLORS[s.courses.length % COLORS.length],
      })
      .select()
      .single();
    if (!data) return;
    set((st) => ({
      courses: [
        ...st.courses,
        {
          id: data.id,
          name: data.name,
          emoji: data.emoji,
          color: data.color,
          topics: [],
        },
      ],
    }));
  },

  addTopic: async (courseId, name) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    const { data } = await supabase
      .from("topics")
      .insert({ user_id: user.id, course_id: courseId, name })
      .select()
      .single();
    if (!data) return;
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: [
                ...c.topics,
                { id: data.id, name: data.name, files: [], notes: [], exams: [] },
              ],
            }
          : c,
      ),
    }));
  },

  addFile: async (courseId, topicId, file) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    const { data } = await supabase
      .from("files")
      .insert({
        user_id: user.id,
        topic_id: topicId,
        name: file.name,
        kind: file.kind,
        size: file.size,
        added_at: file.addedAt,
      })
      .select()
      .single();
    if (!data) return;
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? {
                      ...t,
                      files: [
                        ...t.files,
                        {
                          id: data.id,
                          name: data.name,
                          kind: data.kind as FileItem["kind"],
                          size: data.size,
                          addedAt: data.added_at,
                        },
                      ],
                    }
                  : t,
              ),
            }
          : c,
      ),
    }));
  },

  createExam: async (courseId, topicId, title, durationMin, questions) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { data: examRow } = await supabase
      .from("exams")
      .insert({
        user_id: user.id,
        topic_id: topicId,
        title,
        duration_min: durationMin,
      })
      .select()
      .single();
    if (!examRow) return;

    const rows = questions.map((q, i) => {
      // keep legacy mcq columns populated for compatibility
      const isMcq = q.type === "mcq";
      const opts = isMcq ? q.blanks[0]?.options ?? [] : [];
      const correctIndex = isMcq
        ? Math.max(0, opts.indexOf(q.blanks[0]?.correct ?? ""))
        : null;
      return {
        user_id: user.id,
        exam_id: examRow.id,
        type: q.type,
        text: q.text,
        blanks: q.blanks,
        options: opts,
        correct_index: correctIndex,
        explanations: q.explanations ?? [],
        image_url: q.imageUrl ?? null,
        image_labels: q.imageLabels ?? [],
        position: i,
      };
    });
    if (rows.length) {
      await supabase.from("questions").insert(rows);
    }

    const loaded = await loadAll();
    set({ courses: loaded.courses });
  },

  addNote: async (courseId, topicId, title, sections) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return null;
    const { data } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        topic_id: topicId,
        title,
        sections,
        updated_at: "just now",
      })
      .select()
      .single();
    if (!data) return null;
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? {
                      ...t,
                      notes: [
                        ...t.notes,
                        {
                          id: data.id,
                          title: data.title,
                          updatedAt: data.updated_at,
                          sections: (data.sections as NoteSection[]) ?? [],
                        },
                      ],
                    }
                  : t,
              ),
            }
          : c,
      ),
    }));
    return data.id;
  },

  recordExamResult: async (courseId, topicId, examId, answers) => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    const state = get();
    const course = state.courses.find((c) => c.id === courseId);
    const topic = course?.topics.find((t) => t.id === topicId);
    const exam = topic?.exams.find((e) => e.id === examId);
    if (!course || !topic || !exam) return;

    const answerRows: {
      user_id: string;
      question_id: string;
      exam_id: string;
      blank_id: string;
      chosen_value: string;
      is_correct: boolean;
    }[] = [];
    const mistakeRows: {
      user_id: string;
      course_id: string;
      topic_id: string;
      exam_id: string;
      question_id: string;
      blank_id: string;
      blank_label: string;
      question_text: string;
      chosen_value: string;
      correct_value: string;
    }[] = [];

    for (const q of exam.questions) {
      for (const blank of q.blanks) {
        const value = answers[`${q.id}:${blank.id}`];
        if (value === undefined) continue;
        const correct = isBlankCorrect(blank, value, q.type);
        answerRows.push({
          user_id: user.id,
          question_id: q.id,
          exam_id: examId,
          blank_id: blank.id,
          chosen_value: value,
          is_correct: correct,
        });
        if (!correct) {
          mistakeRows.push({
            user_id: user.id,
            course_id: courseId,
            topic_id: topicId,
            exam_id: examId,
            question_id: q.id,
            blank_id: blank.id,
            blank_label: blank.label ?? "",
            question_text: q.text,
            chosen_value: value,
            correct_value: blank.correct,
          });
        }
      }
    }

    if (answerRows.length) {
      await supabase.from("answers").insert(answerRows);
    }
    if (mistakeRows.length) {
      await supabase
        .from("mistakes")
        .upsert(mistakeRows, { onConflict: "user_id,question_id,blank_id" });
    }

    const loaded = await loadAll();
    set({
      courses: loaded.courses,
      mistakes: loaded.mistakes,
      questionsSolved: loaded.questionsSolved,
    });
  },

  clearMistakes: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    await supabase.from("mistakes").delete().eq("user_id", user.id);
    set({ mistakes: [] });
  },

  deleteMistake: async (id) => {
    await supabase.from("mistakes").delete().eq("id", id);
    set((st) => ({ mistakes: st.mistakes.filter((m) => m.id !== id) }));
  },

  deleteCourse: async (courseId) => {
    const s = get();
    const course = s.courses.find((c) => c.id === courseId);
    if (!course) return;
    const topicIds = course.topics.map((t) => t.id);
    const examIds = course.topics.flatMap((t) => t.exams.map((e) => e.id));
    await supabase.from("mistakes").delete().eq("course_id", courseId);
    if (examIds.length) {
      await supabase.from("answers").delete().in("exam_id", examIds);
      await supabase.from("questions").delete().in("exam_id", examIds);
      await supabase.from("exams").delete().in("id", examIds);
    }
    if (topicIds.length) {
      await supabase.from("files").delete().in("topic_id", topicIds);
      await supabase.from("notes").delete().in("topic_id", topicIds);
      await supabase.from("topics").delete().in("id", topicIds);
    }
    await supabase.from("courses").delete().eq("id", courseId);
    set((st) => ({
      courses: st.courses.filter((c) => c.id !== courseId),
      mistakes: st.mistakes.filter((m) => m.courseId !== courseId),
    }));
  },

  deleteTopic: async (courseId, topicId) => {
    const s = get();
    const topic = s.courses
      .find((c) => c.id === courseId)
      ?.topics.find((t) => t.id === topicId);
    if (!topic) return;
    const examIds = topic.exams.map((e) => e.id);
    await supabase.from("mistakes").delete().eq("topic_id", topicId);
    if (examIds.length) {
      await supabase.from("answers").delete().in("exam_id", examIds);
      await supabase.from("questions").delete().in("exam_id", examIds);
      await supabase.from("exams").delete().in("id", examIds);
    }
    await supabase.from("files").delete().eq("topic_id", topicId);
    await supabase.from("notes").delete().eq("topic_id", topicId);
    await supabase.from("topics").delete().eq("id", topicId);
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? { ...c, topics: c.topics.filter((t) => t.id !== topicId) }
          : c,
      ),
      mistakes: st.mistakes.filter((m) => m.topicId !== topicId),
    }));
  },

  deleteFile: async (courseId, topicId, fileId) => {
    await supabase.from("files").delete().eq("id", fileId);
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? { ...t, files: t.files.filter((f) => f.id !== fileId) }
                  : t,
              ),
            }
          : c,
      ),
    }));
  },

  deleteExam: async (courseId, topicId, examId) => {
    await supabase.from("mistakes").delete().eq("exam_id", examId);
    await supabase.from("answers").delete().eq("exam_id", examId);
    await supabase.from("questions").delete().eq("exam_id", examId);
    await supabase.from("exams").delete().eq("id", examId);
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? { ...t, exams: t.exams.filter((e) => e.id !== examId) }
                  : t,
              ),
            }
          : c,
      ),
      mistakes: st.mistakes.filter((m) => m.examId !== examId),
    }));
  },

  deleteNote: async (courseId, topicId, noteId) => {
    await supabase.from("notes").delete().eq("id", noteId);
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? { ...t, notes: t.notes.filter((n) => n.id !== noteId) }
                  : t,
              ),
            }
          : c,
      ),
    }));
  },
  updateNote: async (courseId, topicId, noteId, title, sections) => {
    const updatedAt = new Date().toISOString();
    await supabase
      .from("notes")
      .update({ title, sections, updated_at: updatedAt })
      .eq("id", noteId);
    set((st) => ({
      courses: st.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? {
                      ...t,
                      notes: t.notes.map((n) =>
                        n.id === noteId ? { ...n, title, sections, updatedAt } : n,
                      ),
                    }
                  : t,
              ),
            }
          : c,
      ),
    }));
  },
}));
