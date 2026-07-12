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

/* ---------- sample seed data (created once per new user) ---------- */

const seedNoteSections: NoteSection[] = [
  {
    key: "overview",
    title: "סקירה כללית",
    icon: "📋",
    body: "גליקוליזה היא מסלול מטבולי שמפרק גלוקוז (6 פחמנים) לשתי מולקולות פירובט (3 פחמנים). התהליך מתרחש בציטוזול, אינו דורש חמצן, ומייצר תשואה נטו של 2 ATP ו-2 NADH לכל מולקולת גלוקוז.",
  },
  {
    key: "full",
    title: "תוכן מלא",
    icon: "📖",
    body: "המסלול כולל 10 שלבים אנזימטיים המחולקים לשלב השקעת אנרגיה (שלבים 1–5, צריכת 2 ATP) ולשלב תשואת אנרגיה (שלבים 6–10, ייצור 4 ATP ו-2 NADH). האנזימים המווסתים המרכזיים הם הקסוקינאז, פוספופרוקטוקינאז-1 (PFK-1) ופירובט קינאז. PFK-1 הוא נקודת הבקרה החשובה ביותר.",
  },
  {
    key: "tables",
    title: "טבלאות השוואה",
    icon: "📊",
    body: 'הקסוקינאז: Km נמוך, מעוכב ע"י התוצר (G6P), נמצא ברוב הרקמות.\nגלוקוקינאז: Km גבוה, אינו מעוכב ע"י G6P, נמצא בכבד ובלבלב, מושרה ע"י אינסולין.',
  },
  {
    key: "highyield",
    title: "High Yield",
    icon: "⭐",
    body: "PFK-1 הוא האנזים מגביל-הקצב. הוא מעוכב ע\"י ATP וציטרט, ומופעל ע\"י AMP ו-fructose-2,6-bisphosphate.",
  },
  {
    key: "clinical",
    title: "קורלציות קליניות",
    icon: "🏥",
    body: "חסר בפירובט קינאז הוא הסיבה השנייה בשכיחותה לאנמיה המוליטית לא-ספרוציטית. תאי דם אדומים תלויים לחלוטין בגליקוליזה לאנרגיה.",
  },
  {
    key: "mistakes",
    title: "טעויות נפוצות",
    icon: "⚠️",
    body: "טעות נפוצה: לחשוב שגליקוליזה דורשת חמצן. היא אנאירובית. בלבול בין תשואת ATP ברוטו (4) לנטו (2).",
  },
  {
    key: "details",
    title: "פרטים קטנים",
    icon: "🔍",
    body: "השלב היחיד שבו מיוצר NADH הוא ע\"י גליצראלדהיד-3-פוספט דהידרוגנאז (GAPDH). ארסן מפרק את הצימוד בין חמצון לזרחון בשלב זה.",
  },
];

const seedQuestions: Omit<Question, "id">[] = [
  {
    text: "מהו האנזים מגביל-הקצב (rate-limiting) של הגליקוליזה?",
    options: ["הקסוקינאז", "פוספופרוקטוקינאז-1 (PFK-1)", "פירובט קינאז", "אלדולאז"],
    correctIndex: 1,
    explanations: [
      "הקסוקינאז מזרחן גלוקוז אך אינו נקודת הבקרה המרכזית.",
      "נכון — PFK-1 הוא האנזים מגביל-הקצב והבקרה המרכזית של המסלול.",
      "פירובט קינאז פועל בשלב האחרון אך אינו מגביל-קצב.",
      "אלדולאז מפצל fructose-1,6-bisphosphate ואינו מווסת.",
    ],
  },
  {
    text: "מהי התשואה נטו של ATP לכל מולקולת גלוקוז בגליקוליזה?",
    options: ["1 ATP", "2 ATP", "4 ATP", "6 ATP"],
    correctIndex: 1,
    explanations: [
      "מעט מדי — מייצרים 4 וצורכים 2.",
      "נכון — 4 ATP מיוצרים פחות 2 שנצרכו = 2 ATP נטו.",
      "זו התשואה ברוטו, לא הנטו.",
      "ערך שגוי, אינו תואם את המסלול.",
    ],
  },
  {
    text: "היכן בתא מתרחשת הגליקוליזה?",
    options: ["מיטוכונדריה", "ציטוזול", "גרעין", "רשתית אנדופלזמית"],
    correctIndex: 1,
    explanations: [
      "מעגל קרבס וזרחון חמצוני מתרחשים במיטוכונדריה, לא גליקוליזה.",
      "נכון — כל שלבי הגליקוליזה מתרחשים בציטוזול.",
      "הגרעין אחראי לתמלול, לא למטבוליזם זה.",
      "הרשתית האנדופלזמית אינה אתר הגליקוליזה.",
    ],
  },
  {
    text: "חסר באיזה אנזים גורם לאנמיה המוליטית בתאי דם אדומים?",
    options: ["גלוקוקינאז", "פירובט קינאז", "הקסוקינאז", "אנולאז"],
    correctIndex: 1,
    explanations: [
      "גלוקוקינאז נמצא בכבד ובלבלב, לא בתאי דם אדומים.",
      "נכון — חסר בפירובט קינאז פוגע בייצור ATP בתאי דם אדומים.",
      "חסר בהקסוקינאז נדיר מאוד ואינו הסיבה הקלאסית.",
      "חסר באנולאז אינו הגורם הטיפוסי לאנמיה זו.",
    ],
  },
  {
    text: "איזו מולקולה מפעילה (מגבירה) את פעילות PFK-1?",
    options: ["ATP", "ציטרט", "AMP", "NADH"],
    correctIndex: 2,
    explanations: [
      "ATP דווקא מעכב את PFK-1 (בקרה אלוסטרית שלילית).",
      "ציטרט מעכב את PFK-1.",
      "נכון — AMP מסמן מחסור באנרגיה ומפעיל את PFK-1.",
      "NADH אינו מפעיל ישיר של PFK-1.",
    ],
  },
];

async function seedSampleData(userId: string) {
  // Biochemistry course
  const { data: course } = await supabase
    .from("courses")
    .insert({ user_id: userId, name: "ביוכימיה", emoji: "🧬", color: "190" })
    .select()
    .single();
  if (!course) return;

  const { data: bioTopic } = await supabase
    .from("topics")
    .insert({ user_id: userId, course_id: course.id, name: "גליקוליזה" })
    .select()
    .single();

  // Histology course
  const { data: histo } = await supabase
    .from("courses")
    .insert({ user_id: userId, name: "היסטולוגיה", emoji: "🔬", color: "60" })
    .select()
    .single();
  if (histo) {
    await supabase.from("topics").insert([
      { user_id: userId, course_id: histo.id, name: "רקמת עצב" },
      { user_id: userId, course_id: histo.id, name: "רקמת שריר" },
      { user_id: userId, course_id: histo.id, name: "דם" },
    ]);
  }

  // Immunology course
  const { data: immuno } = await supabase
    .from("courses")
    .insert({ user_id: userId, name: "אימונולוגיה", emoji: "🛡️", color: "155" })
    .select()
    .single();
  if (immuno) {
    await supabase
      .from("topics")
      .insert({ user_id: userId, course_id: immuno.id, name: "חסינות מולדת" });
  }

  if (!bioTopic) return;

  await supabase.from("files").insert({
    user_id: userId,
    topic_id: bioTopic.id,
    name: "גליקוליזה - הרצאה 3.pdf",
    kind: "pdf",
    size: "2.4MB",
    added_at: "אתמול",
  });

  await supabase.from("notes").insert({
    user_id: userId,
    topic_id: bioTopic.id,
    title: "גליקוליזה — סיכום מלא",
    sections: seedNoteSections,
    updated_at: "היום",
  });

  const { data: exam } = await supabase
    .from("exams")
    .insert({
      user_id: userId,
      topic_id: bioTopic.id,
      title: "מבחן גליקוליזה — 5 שאלות",
      duration_min: 10,
    })
    .select()
    .single();

  if (exam) {
    await supabase.from("questions").insert(
      seedQuestions.map((q, i) => ({
        user_id: userId,
        exam_id: exam.id,
        text: q.text,
        options: q.options,
        correct_index: q.correctIndex,
        explanations: q.explanations,
        position: i,
      })),
    );
  }
}

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
