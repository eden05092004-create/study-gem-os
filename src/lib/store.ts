import { create } from "zustand";

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

const uid = () => Math.random().toString(36).slice(2, 10);

const glycolysisNote: Note = {
  id: "note-glyco",
  title: "גליקוליזה — סיכום מלא",
  updatedAt: "היום",
  sections: [
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
      body: "הקסוקינאז: Km נמוך, מעוכב ע\"י התוצר (G6P), נמצא ברוב הרקמות.\nגלוקוקינאז: Km גבוה, אינו מעוכב ע\"י G6P, נמצא בכבד ובלבלב, מושרה ע\"י אינסולין.",
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
  ],
};

const glycolysisExam: Exam = {
  id: "exam-glyco",
  title: "מבחן גליקוליזה — 5 שאלות",
  durationMin: 10,
  questions: [
    {
      id: "q1",
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
      id: "q2",
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
      id: "q3",
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
      id: "q4",
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
      id: "q5",
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
  ],
};

const initialCourses: Course[] = [
  {
    id: "course-biochem",
    name: "ביוכימיה",
    emoji: "🧬",
    color: "190",
    topics: [
      {
        id: "topic-glyco",
        name: "גליקוליזה",
        files: [
          {
            id: uid(),
            name: "גליקוליזה - הרצאה 3.pdf",
            kind: "pdf",
            size: "2.4MB",
            addedAt: "אתמול",
          },
        ],
        notes: [glycolysisNote],
        exams: [glycolysisExam],
      },
    ],
  },
  {
    id: "course-histo",
    name: "היסטולוגיה",
    emoji: "🔬",
    color: "60",
    topics: [
      { id: "topic-nerve", name: "רקמת עצב", files: [], notes: [], exams: [] },
      { id: "topic-muscle", name: "רקמת שריר", files: [], notes: [], exams: [] },
      { id: "topic-blood", name: "דם", files: [], notes: [], exams: [] },
    ],
  },
  {
    id: "course-immuno",
    name: "אימונולוגיה",
    emoji: "🛡️",
    color: "155",
    topics: [
      { id: "topic-innate", name: "חסינות מולדת", files: [], notes: [], exams: [] },
    ],
  },
];

type State = {
  userName: string;
  studyHoursToday: number;
  questionsSolved: number;
  nextExamDate: string;
  courses: Course[];
  mistakes: MistakeEntry[];
  addCourse: (name: string, emoji: string) => void;
  addTopic: (courseId: string, name: string) => void;
  addFile: (courseId: string, topicId: string, file: Omit<FileItem, "id">) => void;
  recordExamResult: (
    courseId: string,
    topicId: string,
    examId: string,
    answers: Record<string, number>,
  ) => void;
  clearMistakes: () => void;
};

const EMOJIS = ["📘", "📗", "📙", "📕", "🧪", "💊", "🦴", "❤️"];

export const useStore = create<State>((set, get) => ({
  userName: "דניאל",
  studyHoursToday: 3.5,
  questionsSolved: 128,
  nextExamDate: new Date(Date.now() + 6 * 86400000).toISOString(),
  courses: initialCourses,
  mistakes: [],
  addCourse: (name, emoji) =>
    set((s) => ({
      courses: [
        ...s.courses,
        {
          id: "course-" + uid(),
          name,
          emoji: emoji || EMOJIS[s.courses.length % EMOJIS.length],
          color: ["190", "60", "155", "22"][s.courses.length % 4],
          topics: [],
        },
      ],
    })),
  addTopic: (courseId, name) =>
    set((s) => ({
      courses: s.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: [
                ...c.topics,
                { id: "topic-" + uid(), name, files: [], notes: [], exams: [] },
              ],
            }
          : c,
      ),
    })),
  addFile: (courseId, topicId, file) =>
    set((s) => ({
      courses: s.courses.map((c) =>
        c.id === courseId
          ? {
              ...c,
              topics: c.topics.map((t) =>
                t.id === topicId
                  ? { ...t, files: [...t.files, { ...file, id: uid() }] }
                  : t,
              ),
            }
          : c,
      ),
    })),
  recordExamResult: (courseId, topicId, examId, answers) => {
    const state = get();
    const course = state.courses.find((c) => c.id === courseId);
    const topic = course?.topics.find((t) => t.id === topicId);
    const exam = topic?.exams.find((e) => e.id === examId);
    if (!course || !topic || !exam) return;
    const newMistakes: MistakeEntry[] = [];
    let solved = 0;
    for (const q of exam.questions) {
      const chosen = answers[q.id];
      if (chosen === undefined) continue;
      solved++;
      if (chosen !== q.correctIndex) {
        newMistakes.push({
          id: uid(),
          courseId,
          courseName: course.name,
          topicId,
          examId,
          question: q,
          chosenIndex: chosen,
          date: "היום",
        });
      }
    }
    set((s) => ({
      questionsSolved: s.questionsSolved + solved,
      mistakes: [
        ...s.mistakes.filter(
          (m) => !newMistakes.some((n) => n.question.id === m.question.id),
        ),
        ...newMistakes,
      ],
    }));
  },
  clearMistakes: () => set({ mistakes: [] }),
}));
