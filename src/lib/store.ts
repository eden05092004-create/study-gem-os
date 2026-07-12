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

export type Question = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  /** explanation per option (why right / why wrong) */
  explanations: string[];
};

export type Exam = {
  id: string;
  title: string;
  durationMin: number;
  questions: Question[];
};

export type Topic = {
  id: string;
  name: string;
  files: FileItem[];
  notes: Note[];
  exams: Exam[];
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
  chosenIndex: number;
  date: string;
};

const EMOJIS = ["📘", "📗", "📙", "📕", "🧪", "💊", "🦴", "❤️"];
const COLORS = ["190", "60", "155", "22"];

/* ---------- store ---------- */


type State = {
  userName: string;
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
  recordExamResult: (
    courseId: string,
    topicId: string,
    examId: string,
    answers: Record<string, number>,
  ) => Promise<void>;
  clearMistakes: () => Promise<void>;
};

async function loadAll(userId: string) {
  const [
    coursesRes,
    topicsRes,
    filesRes,
    notesRes,
    examsRes,
    questionsRes,
    mistakesRes,
    answersRes,
  ] = await Promise.all([
    supabase.from("courses").select("*").order("created_at"),
    supabase.from("topics").select("*").order("created_at"),
    supabase.from("files").select("*").order("created_at"),
    supabase.from("notes").select("*").order("created_at"),
    supabase.from("exams").select("*").order("created_at"),
    supabase.from("questions").select("*").order("position"),
    supabase.from("mistakes").select("*").order("created_at"),
    supabase.from("answers").select("id"),
  ]);

  const questions = questionsRes.data ?? [];
  const questionMap = new Map<string, Question>();
  const questionsByExam = new Map<string, Question[]>();
  for (const q of questions) {
    const question: Question = {
      id: q.id,
      text: q.text,
      options: (q.options as string[]) ?? [],
      correctIndex: q.correct_index,
      explanations: (q.explanations as string[]) ?? [],
    };
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
      chosenIndex: m.chosen_index,
      date: "היום",
    }));

  return {
    courses,
    mistakes,
    questionsSolved: answersRes.data?.length ?? 0,
  };
}

export const useStore = create<State>((set, get) => ({
  userName: "",
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

    // Seed sample data for brand-new accounts
    const { count } = await supabase
      .from("courses")
      .select("id", { count: "exact", head: true });
    if (!count) {
      await seedSampleData(user.id);
    }

    const loaded = await loadAll(user.id);
    set({
      userName: profile?.display_name ?? user.email?.split("@")[0] ?? "סטודנט",
      ...loaded,
      loading: false,
      initialized: true,
    });
  },

  reset: () =>
    set({
      userName: "",
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
      chosen_index: number;
      is_correct: boolean;
    }[] = [];
    const mistakeRows: {
      user_id: string;
      course_id: string;
      topic_id: string;
      exam_id: string;
      question_id: string;
      chosen_index: number;
    }[] = [];

    for (const q of exam.questions) {
      const chosen = answers[q.id];
      if (chosen === undefined) continue;
      const isCorrect = chosen === q.correctIndex;
      answerRows.push({
        user_id: user.id,
        question_id: q.id,
        exam_id: examId,
        chosen_index: chosen,
        is_correct: isCorrect,
      });
      if (!isCorrect) {
        mistakeRows.push({
          user_id: user.id,
          course_id: courseId,
          topic_id: topicId,
          exam_id: examId,
          question_id: q.id,
          chosen_index: chosen,
        });
      }
    }

    if (answerRows.length) {
      await supabase.from("answers").insert(answerRows);
    }
    if (mistakeRows.length) {
      await supabase
        .from("mistakes")
        .upsert(mistakeRows, { onConflict: "user_id,question_id" });
    }

    const loaded = await loadAll(user.id);
    set({ courses: loaded.courses, mistakes: loaded.mistakes, questionsSolved: loaded.questionsSolved });
  },

  clearMistakes: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    await supabase.from("mistakes").delete().eq("user_id", user.id);
    set({ mistakes: [] });
  },
}));
