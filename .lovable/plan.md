# StudyOS → Lumen-style Rebuild

Convert the current mobile-first StudyOS into the desktop sidebar app shown in the screenshots. Keep the **StudyOS** name and all existing courses/topics/exams/notes/mistakes data. The in-app AI assistant persona shown as "Lumen" will be renamed to "StudyOS".

## Visual direction (theme)
- Warm **paper/cream** background, ink-dark text, thin hairline borders, generous whitespace.
- **Serif display** headings (e.g. "Fraunces"/"Playfair"-style) paired with a clean sans body.
- Small-caps eyebrow labels above each page title (e.g. `LIBRARY`, `PRACTICE`, `TIME`).
- Dark charcoal **pill buttons**; soft rounded cards.
- Rework `src/styles.css` tokens + load the serif font via `<link>` in `__root.tsx`.

## Layout shell
- Replace bottom-nav with a fixed **left sidebar** (shadcn Sidebar), collapsible, responsive to a mobile drawer.
- Sidebar groups: **(top)** Dashboard, Courses, Study Planner, Calendar · **LIBRARY** Materials, Notes · **PRACTICE** AI Assistant, Question Generator, Quiz & Exam, Flashcards, Mistake Notebook · **YOU** Progress, Settings.
- Top bar with "Ask StudyOS…" search field + primary "New" action; user card (avatar, name, email, sign out) pinned at sidebar bottom.
- New `AppShell` built around the sidebar; auth guard preserved.

## Pages
Reworked to new design (existing logic reused):
- **Dashboard** — greeting, stat cards (Study time, Courses, Cards due, Mistakes), Today's sessions, Upcoming exams, quick-action cards.
- **Courses** + topic detail (Files/Notes/Exams/Flashcards tabs).
- **Study Planner** — Today/Week/All views, auto-plan, sessions checklist.
- **Mistake Notebook**, **Settings**, **Upload/Materials**, **Notes**, exam runner + generators.

New pages/features (need new tables):
- **Calendar** — month grid combining study sessions + exam dates, day detail panel.
- **Materials** — unified library (pdf/image/text/link/audio) with filter tabs; folds in current Upload.
- **Notes** (standalone) — notes list + simple editor, alongside topic notes.
- **AI Assistant** — saved chat threads, tutor over your materials (Lovable AI).
- **Question Generator** — source material/course/count/difficulty + question-type checkboxes → generates into the question bank.
- **Quiz & Exam** — Practice / Exam / Timed / Weak modes, course + count selectors, launches the exam runner.
- **Flashcards** — deck with due-today count, AI-generate, spaced review.
- **Progress** — study stats and charts.

## Data / backend (new migrations)
Add tables (RLS scoped to `auth.uid()`, GRANTs included):
- `study_sessions` (planner/calendar), `materials`, `standalone_notes`, `flashcards`, `chat_threads` + `chat_messages`.
- Reuse existing `courses/topics/files/notes/exams/questions/answers/mistakes/study_plans/user_settings`.

## Technical notes
- TanStack file-based routes under `src/routes/`; each new page its own route file with `head()` metadata.
- AI features (assistant, question/flashcard/notes generation) use Lovable AI via `createServerFn` in `src/lib/ai.functions.ts` (LOVABLE_API_KEY already set) — replacing the Anthropic-key-in-Settings path with the built-in gateway.
- Zustand store extended with new slices; keep async Supabase sync pattern.

## Phasing
1. Theme + sidebar shell + Dashboard (visible foundation).
2. Migrate existing pages (Courses, Planner, Mistakes, Settings, exam flow) to new shell.
3. New backend tables + Materials, Notes, Calendar.
4. AI Assistant, Question Generator, Quiz & Exam, Flashcards, Progress.

I'll verify the build/typecheck and preview after each phase.