/**
 * Intelligent Study Plan Scheduler — a pure, deterministic engine.
 *
 * Given a raw list of lectures and a time window, produces a day-by-day study
 * plan that is feasible, pedagogically coherent, and honest about its own
 * constraints. Never silently outputs an impossible schedule (see
 * `checkFeasibility`). No I/O, no randomness — same input always yields the
 * same output.
 */

/* ============================== Inputs ============================== */

export type Lecture = {
  id: string;
  title: string;
  course: string;
  discipline: string;
  /** Difficulty/density weight. Default 1.0 — see SUGGESTED_WEIGHTS. */
  weight?: number;
  /** Preserves source ordering; used as the tiebreaker everywhere for determinism. */
  originalOrder: number;
};

export type PlanConfig = {
  lectures: Lecture[];
  startDate: Date;
  deadline: Date;
  /** Realistic committed hours per day. */
  hoursPerDay: number;
  /** The user's actual pace, in minutes per lecture. */
  minutesPerLecture: number;
  unavailableDays?: Date[];
  /** Default true. */
  includeReviewTime?: boolean;
};

/** Suggested per-lecture weights from the spec — callers may use these when tagging lectures. */
export const SUGGESTED_WEIGHTS = {
  overview: 0.75,
  standard: 1.0,
  denseMechanism: 1.5,
  clinicalCase: 0.75,
} as const;

const DEFAULT_REVIEW_OVERHEAD_HOURS = 0.5;

/* ============================ Feasibility ============================= */

export type FeasibilityResolution =
  | { kind: "increase_hours"; hoursPerDay: number; description: string }
  | { kind: "increase_pace"; minutesPerLecture: number; description: string }
  | { kind: "extend_deadline"; deadline: Date; description: string };

export type FeasibilityOk = {
  feasible: true;
  totalLectures: number;
  availableDays: number;
  requiredPerDay: number;
  hoursRequiredPerDay: number;
  reviewOverheadHours: number;
  hoursCommitted: number;
};

export type FeasibilityWarning = {
  feasible: false;
  totalLectures: number;
  availableDays: number;
  requiredPerDay: number;
  hoursRequiredPerDay: number;
  reviewOverheadHours: number;
  hoursCommitted: number;
  gapHours: number;
  message: string;
  resolutions: FeasibilityResolution[];
};

export type FeasibilityResult = FeasibilityOk | FeasibilityWarning;

/** STEP ONE. Run before generating anything. Never skip this. */
export function checkFeasibility(config: PlanConfig): FeasibilityResult {
  const totalLectures = config.lectures.length;
  const availableDates = computeAvailableDates(config);
  const availableDays = availableDates.length;
  const includeReview = config.includeReviewTime ?? true;
  const reviewOverheadHours = includeReview ? DEFAULT_REVIEW_OVERHEAD_HOURS : 0;

  if (totalLectures === 0) {
    return {
      feasible: true,
      totalLectures: 0,
      availableDays,
      requiredPerDay: 0,
      hoursRequiredPerDay: reviewOverheadHours,
      reviewOverheadHours,
      hoursCommitted: config.hoursPerDay,
    };
  }

  if (availableDays === 0) {
    return buildWarning(config, totalLectures, 0, Infinity, reviewOverheadHours);
  }

  const requiredPerDay = Math.ceil(totalLectures / availableDays);
  const hoursRequired = requiredPerDay * (config.minutesPerLecture / 60);
  const totalRequired = hoursRequired + reviewOverheadHours;

  if (totalRequired > config.hoursPerDay) {
    return buildWarning(config, totalLectures, availableDays, requiredPerDay, reviewOverheadHours);
  }

  return {
    feasible: true,
    totalLectures,
    availableDays,
    requiredPerDay,
    hoursRequiredPerDay: totalRequired,
    reviewOverheadHours,
    hoursCommitted: config.hoursPerDay,
  };
}

function buildWarning(
  config: PlanConfig,
  totalLectures: number,
  availableDays: number,
  requiredPerDay: number,
  reviewOverheadHours: number,
): FeasibilityWarning {
  const hoursRequired = requiredPerDay * (config.minutesPerLecture / 60);
  const totalRequired = hoursRequired + reviewOverheadHours;
  const gapHours = totalRequired - config.hoursPerDay;

  const neededHours = Number.isFinite(totalRequired) ? Math.ceil(totalRequired) : Infinity;
  const increaseHours: FeasibilityResolution = {
    kind: "increase_hours",
    hoursPerDay: neededHours,
    description: Number.isFinite(neededHours)
      ? `Commit to ${neededHours} hour${plural(neededHours)}/day instead of ${config.hoursPerDay}.`
      : `No amount of daily hours fixes this — there are zero available study days before the deadline.`,
  };

  const budgetHoursForLectures = config.hoursPerDay - reviewOverheadHours;
  let neededMinutes = Infinity;
  if (availableDays > 0 && budgetHoursForLectures > 0 && Number.isFinite(requiredPerDay) && requiredPerDay > 0) {
    neededMinutes = Math.max(0, Math.floor((budgetHoursForLectures * 60) / requiredPerDay));
  }
  const increasePace: FeasibilityResolution = {
    kind: "increase_pace",
    minutesPerLecture: Number.isFinite(neededMinutes) ? neededMinutes : 0,
    description:
      Number.isFinite(neededMinutes) && neededMinutes > 0
        ? `Cut your pace to ~${neededMinutes} min/lecture (from ${config.minutesPerLecture}) — e.g. faster playback or tighter notes.`
        : `Even at a much faster pace this deadline can't absorb the load — pace alone won't fix it.`,
  };

  const lecturesPerDayAtCapacity =
    budgetHoursForLectures > 0 ? Math.floor((budgetHoursForLectures * 60) / config.minutesPerLecture) : 0;
  let earliestDeadline: Date | null = null;
  if (lecturesPerDayAtCapacity > 0) {
    const daysNeeded = Math.ceil(totalLectures / lecturesPerDayAtCapacity);
    earliestDeadline = addAvailableDays(config.startDate, daysNeeded, config.unavailableDays ?? []);
  }
  const extendDeadline: FeasibilityResolution = {
    kind: "extend_deadline",
    deadline: earliestDeadline ?? config.deadline,
    description: earliestDeadline
      ? `Push the deadline to ${dateKey(earliestDeadline)} — the earliest realistic finish at ${config.hoursPerDay}h/day and your current pace.`
      : `Your committed hours are too low to fit even one lecture/day after review overhead — extending the deadline alone won't help; increase hours too.`,
  };

  const gapText = Number.isFinite(gapHours)
    ? `You're short by ${round1(gapHours)} hour${plural(round1(gapHours))}/day.`
    : `There are no available days left before the deadline.`;

  const message = Number.isFinite(requiredPerDay)
    ? `${totalLectures} lectures ÷ ${availableDays} day${plural(availableDays)} = ${requiredPerDay}/day = ${round1(
        hoursRequired,
      )} hour${plural(round1(hoursRequired))}/day${
        reviewOverheadHours ? ` + ${reviewOverheadHours}h review` : ""
      }. You committed to ${config.hoursPerDay} hour${plural(config.hoursPerDay)}/day. ${gapText}`
    : `${totalLectures} lectures cannot be scheduled — there are 0 available days between the start date and the deadline. ${gapText}`;

  return {
    feasible: false,
    totalLectures,
    availableDays,
    requiredPerDay,
    hoursRequiredPerDay: totalRequired,
    reviewOverheadHours,
    hoursCommitted: config.hoursPerDay,
    gapHours,
    message,
    resolutions: [increaseHours, increasePace, extendDeadline],
  };
}

/* =============================== Output ================================ */

export type ReviewItem = {
  kind: "daily-review" | "weekly-review" | "dedicated-review";
  minutes: number;
  label: string;
};

export type PlanDay = {
  date: Date;
  dateKey: string;
  course: string;
  /** Discipline name, or "DisciplineA + DisciplineB" at a block boundary, or "Review" for a dedicated review day. */
  discipline: string;
  review: ReviewItem[];
  items: Lecture[];
  estimatedHours: number;
  totalWeight: number;
};

export type Bottleneck = {
  type: "dense-discipline-streak" | "overloaded-day";
  discipline?: string;
  startDate: Date;
  endDate: Date;
  message: string;
};

export type ReviewProtocol = {
  embedded: boolean;
  dailyMinutes: number;
  weeklyMinutes: number;
  description: string;
};

export type StudyPlan = {
  feasibility: FeasibilityResult;
  days: PlanDay[];
  bottlenecks: Bottleneck[];
  reviewProtocol: ReviewProtocol;
  totalLectures: number;
  scheduledLectures: number;
  averageWeightPerDay: number;
};

/**
 * Generate the full plan. Always computes and returns the feasibility result
 * (§2) alongside the plan — the caller decides how to surface it — but never
 * drops a lecture regardless of feasibility outcome (§11.1/§11.2).
 */
export function generateStudyPlan(config: PlanConfig): StudyPlan {
  const feasibility = checkFeasibility(config);
  const includeReview = config.includeReviewTime ?? true;
  const availableDates = computeAvailableDates(config);

  if (config.lectures.length === 0 || availableDates.length === 0) {
    return {
      feasibility,
      days: [],
      bottlenecks: [],
      reviewProtocol: {
        embedded: false,
        dailyMinutes: 0,
        weeklyMinutes: 0,
        description:
          config.lectures.length === 0 ? "No lectures to schedule." : "No available days before the deadline.",
      },
      totalLectures: config.lectures.length,
      scheduledLectures: 0,
      averageWeightPerDay: 0,
    };
  }

  const groups = groupByCourse(config.lectures);
  const daysForCourse = allocateCourseDays(groups, availableDates.length);
  const hasSpareDays = includeReview && computeHasSpareDays(groups, config, availableDates.length);

  let cursor = 0;
  const allDays: PlanDay[] = [];
  for (let i = 0; i < groups.length; i++) {
    const dayCount = daysForCourse[i];
    let dates = availableDates.slice(cursor, cursor + dayCount);
    cursor += dayCount;

    if (dates.length === 0 && groups[i].lectures.length > 0) {
      // Degenerate fallback: more distinct courses than available days. Zero-drop
      // (§11.1) outranks no-interleaving (§11.4) here — pile onto the last day.
      dates = [availableDates[availableDates.length - 1]];
    }
    if (dates.length === 0) continue;

    const blocks = buildDisciplineBlocks(groups[i].lectures);
    const courseDays = scheduleCourse(
      groups[i].course,
      blocks,
      dates.length,
      dates,
      hasSpareDays ? "dedicated" : "none",
      config.minutesPerLecture,
    );
    allDays.push(...courseDays);
  }

  allDays.sort((a, b) => a.date.getTime() - b.date.getTime());

  // §11.1 — non-negotiable. Assert every input lecture appears exactly once.
  const scheduledIds = allDays.flatMap((d) => d.items.map((l) => l.id));
  const scheduledIdSet = new Set(scheduledIds);
  const missing = config.lectures.filter((l) => !scheduledIdSet.has(l.id));
  if (missing.length > 0 || scheduledIds.length !== config.lectures.length) {
    throw new Error(
      `Scheduler invariant violated: expected ${config.lectures.length} lectures scheduled exactly once, ` +
        `got ${scheduledIds.length} placements (${missing.length} missing).`,
    );
  }

  if (includeReview && !hasSpareDays) {
    embedDailyReview(allDays);
  }

  const bottlenecks = detectBottlenecks(allDays);

  const contentDays = allDays.filter((d) => d.items.length > 0);
  const averageWeightPerDay =
    contentDays.length > 0 ? contentDays.reduce((s, d) => s + d.totalWeight, 0) / contentDays.length : 0;

  const reviewProtocol: ReviewProtocol = {
    embedded: includeReview && !hasSpareDays,
    dailyMinutes: includeReview && !hasSpareDays ? 20 : 0,
    weeklyMinutes: includeReview ? 30 : 0,
    description: !includeReview
      ? "Review is turned off for this plan."
      : hasSpareDays
        ? "Dedicated review days are inserted at the end of each course block."
        : "No spare days — a 15–20 min active-recall review of the previous day is embedded as the first item every day, plus a 30 min weekly sweep.",
  };

  return {
    feasibility,
    days: allDays,
    bottlenecks,
    reviewProtocol,
    totalLectures: config.lectures.length,
    scheduledLectures: scheduledIdSet.size,
    averageWeightPerDay,
  };
}

/* ========================= §3 course allocation ========================= */

type CourseGroup = { course: string; lectures: Lecture[] };

function groupByCourse(lectures: Lecture[]): CourseGroup[] {
  const order: string[] = [];
  const map = new Map<string, Lecture[]>();
  for (const l of sortByOriginalOrder(lectures)) {
    if (!map.has(l.course)) {
      map.set(l.course, []);
      order.push(l.course);
    }
    map.get(l.course)!.push(l);
  }
  return order.map((course) => ({ course, lectures: map.get(course)! }));
}

function computeHasSpareDays(groups: CourseGroup[], config: PlanConfig, availableDays: number): boolean {
  const maxLecturesPerDayAtCapacity = Math.max(0, Math.floor((config.hoursPerDay * 60) / config.minutesPerLecture));
  const packedDaysNeeded =
    maxLecturesPerDayAtCapacity > 0
      ? groups.reduce((s, g) => s + Math.ceil(g.lectures.length / maxLecturesPerDayAtCapacity), 0)
      : Infinity;
  return packedDaysNeeded < availableDays;
}

/** Whether a plan's committed hours leave genuine slack beyond raw physical capacity —
 *  useful for deciding whether to recommend dedicated review days vs. embedded daily review
 *  even outside of `generateStudyPlan` (e.g. for a manually-authored schedule). */
export function hasSpareCapacity(config: PlanConfig): boolean {
  const availableDates = computeAvailableDates(config);
  const groups = groupByCourse(config.lectures);
  return (config.includeReviewTime ?? true) && computeHasSpareDays(groups, config, availableDates.length);
}

function allocateCourseDays(groups: CourseGroup[], availableDays: number): number[] {
  const n = groups.length;
  if (n === 0 || availableDays <= 0) return groups.map(() => 0);
  const total = groups.reduce((s, g) => s + g.lectures.length, 0);
  if (total === 0) return groups.map(() => 0);

  const raw = groups.map((g) => (g.lectures.length / total) * availableDays);
  const days = raw.map((r) => Math.round(r));

  if (availableDays >= n) {
    for (let i = 0; i < n; i++) {
      if (days[i] === 0 && groups[i].lectures.length > 0) days[i] = 1;
    }
  }

  let diff = availableDays - days.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const dir = diff > 0 ? 1 : -1;
    let idx = -1;
    let bestDelta = -Infinity;
    for (let i = 0; i < n; i++) {
      const floor = availableDays >= n && groups[i].lectures.length > 0 ? 1 : 0;
      if (dir < 0 && days[i] <= floor) continue;
      const delta = dir > 0 ? raw[i] - days[i] : days[i] - raw[i];
      if (delta > bestDelta) {
        bestDelta = delta;
        idx = i;
      }
    }
    if (idx === -1) break;
    days[idx] += dir;
    diff -= dir;
  }

  if (availableDays < n) {
    // Degenerate case: more courses than days. Give the first `availableDays`
    // non-empty courses (in original order) one day each; the rest fall back
    // to the last-day merge handled by the caller.
    const nonEmptyIdx = groups.map((_, i) => i).filter((i) => groups[i].lectures.length > 0);
    const clamped = groups.map(() => 0);
    for (let i = 0; i < Math.min(availableDays, nonEmptyIdx.length); i++) {
      clamped[nonEmptyIdx[i]] = 1;
    }
    return clamped;
  }

  return days;
}

/* ==================== §4 discipline blocks & ordering ==================== */

type DisciplineBlock = { discipline: string; lectures: Lecture[] };

/** Heuristic foundations-before-applications ordering. Unknown disciplines keep
 *  their original relative order and sort after all known ones (stable, deterministic). */
const DISCIPLINE_DEPENDENCY_ORDER = [
  "biology",
  "cell biology",
  "histology",
  "anatomy",
  "biochemistry",
  "genetics",
  "physiology",
  "microbiology",
  "immunology",
  "pharmacology",
  "pathology",
  "pathophysiology",
  "clinical",
  "clinical medicine",
  "integration",
].map((s) => s.toLowerCase());

function disciplineRank(name: string): number {
  const idx = DISCIPLINE_DEPENDENCY_ORDER.indexOf(name.trim().toLowerCase());
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

function buildDisciplineBlocks(lectures: Lecture[]): DisciplineBlock[] {
  const order: string[] = [];
  const map = new Map<string, Lecture[]>();
  const firstSeen = new Map<string, number>();
  for (const l of sortByOriginalOrder(lectures)) {
    if (!map.has(l.discipline)) {
      map.set(l.discipline, []);
      order.push(l.discipline);
      firstSeen.set(l.discipline, l.originalOrder);
    }
    map.get(l.discipline)!.push(l);
  }
  const blocks = order.map((discipline) => ({ discipline, lectures: map.get(discipline)! }));
  blocks.sort((a, b) => {
    const ra = disciplineRank(a.discipline);
    const rb = disciplineRank(b.discipline);
    if (ra !== rb) return ra - rb;
    return firstSeen.get(a.discipline)! - firstSeen.get(b.discipline)!;
  });
  return blocks;
}

/* ================= §5/§6 daily distribution & weighting ================= */

function effectiveWeight(l: Lecture): number {
  const w = l.weight ?? 1.0;
  return Number.isFinite(w) && w > 0 ? w : 1.0;
}

type DayBucket = { disciplines: string[]; lectures: Lecture[] };

/** Front-loaded, block-respecting fill. At most 2 disciplines share a day, and
 *  only at a block boundary. Never produces more buckets than `dayCount`. */
function distributeCourseIntoDays(blocks: DisciplineBlock[], dayCount: number): DayBucket[] {
  const flat = blocks.flatMap((b) => b.lectures.map((l) => ({ l, discipline: b.discipline })));
  if (flat.length === 0 || dayCount === 0) return [];

  const baseCount = Math.floor(flat.length / dayCount);
  const remainder = flat.length - baseCount * dayCount;
  // front-loaded (§5): heavier days first, e.g. 39/8 -> 5,5,5,5,5,5,5,4
  const countTarget = Array.from({ length: dayCount }, (_, i) => baseCount + (i < remainder ? 1 : 0));

  const buckets: DayBucket[] = [{ disciplines: [], lectures: [] }];

  for (const entry of flat) {
    let bucket = buckets[buckets.length - 1];
    const target = countTarget[Math.min(buckets.length - 1, countTarget.length - 1)];
    const introducesNewDiscipline = !bucket.disciplines.includes(entry.discipline);
    const disciplineCapHit = introducesNewDiscipline && bucket.disciplines.length >= 2;
    const countCapHit = bucket.lectures.length >= target;
    const canAdvance = buckets.length < dayCount;

    if (bucket.lectures.length > 0 && (disciplineCapHit || countCapHit) && canAdvance) {
      buckets.push({ disciplines: [], lectures: [] });
      bucket = buckets[buckets.length - 1];
    }
    if (!bucket.disciplines.includes(entry.discipline)) bucket.disciplines.push(entry.discipline);
    bucket.lectures.push(entry.l);
  }

  return mergeOrphanDays(buckets);
}

/** §4.4 — never leave a day with a single orphan lecture split off from a block
 *  that continues on an adjacent day; fold it back in.
 *
 *  Only merges when the neighboring same-discipline day is genuinely larger
 *  (>1 lecture) — i.e. this day looks like a fragment that broke off, not a
 *  deliberately even 1-lecture-per-day allocation (which would otherwise
 *  cascade-collapse into a single giant day). Eligibility is decided against
 *  the original bucket sizes, not the evolving result, to avoid that cascade. */
function mergeOrphanDays(buckets: DayBucket[]): DayBucket[] {
  const src = buckets.map((b) => ({ disciplines: [...b.disciplines], lectures: [...b.lectures] }));
  const result: DayBucket[] = [];

  for (let i = 0; i < src.length; i++) {
    const day = src[i];
    if (day.lectures.length !== 1) {
      result.push(day);
      continue;
    }
    const discipline = day.disciplines[0];
    const prevOriginal = i > 0 ? buckets[i - 1] : undefined;
    const nextOriginal = i < src.length - 1 ? buckets[i + 1] : undefined;
    const prevIsSameLargerBlock =
      prevOriginal && prevOriginal.disciplines[prevOriginal.disciplines.length - 1] === discipline && prevOriginal.lectures.length > 1;
    const nextIsSameLargerBlock =
      nextOriginal && nextOriginal.disciplines[0] === discipline && nextOriginal.lectures.length > 1;

    if (prevIsSameLargerBlock && result.length > 0) {
      result[result.length - 1].lectures.push(...day.lectures);
      continue;
    }
    if (nextIsSameLargerBlock) {
      const target = src[i + 1];
      src[i + 1] = {
        disciplines: target.disciplines[0] === discipline ? target.disciplines : [discipline, ...target.disciplines],
        lectures: [...day.lectures, ...target.lectures],
      };
      continue;
    }
    result.push(day);
  }
  return result;
}

function scheduleCourse(
  course: string,
  blocks: DisciplineBlock[],
  dayCount: number,
  dates: Date[],
  reviewMode: "dedicated" | "none",
  minutesPerLecture: number,
): PlanDay[] {
  const buckets = distributeCourseIntoDays(blocks, dayCount);

  const days: PlanDay[] = buckets.map((b, i) => {
    const date = dates[i];
    const weight = b.lectures.reduce((s, l) => s + effectiveWeight(l), 0);
    return {
      date,
      dateKey: dateKey(date),
      course,
      discipline: b.disciplines.join(" + "),
      review: [],
      items: b.lectures,
      estimatedHours: (b.lectures.length * minutesPerLecture) / 60,
      totalWeight: weight,
    };
  });

  if (reviewMode === "dedicated") {
    const leftover = dates.slice(buckets.length);
    if (leftover.length > 0) {
      const disciplines = blocks.map((b) => b.discipline);
      for (const date of leftover) {
        days.push({
          date,
          dateKey: dateKey(date),
          course,
          discipline: "Review",
          review: [
            {
              kind: "dedicated-review",
              minutes: 30,
              label: `Review sweep — ${course}: ${disciplines.join(", ")}`,
            },
          ],
          items: [],
          estimatedHours: 0.5,
          totalWeight: 0,
        });
      }
    }
  }

  return days;
}

/* ============================ §8 embedded review ============================ */

function embedDailyReview(days: PlanDay[]): void {
  const contentDays = days.filter((d) => d.items.length > 0).sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 0; i < contentDays.length; i++) {
    const day = contentDays[i];
    const prev = contentDays[i - 1];
    if (prev) {
      day.review.unshift({
        kind: "daily-review",
        minutes: 20,
        label: `Active recall — yesterday's ${prev.discipline} (${prev.course})`,
      });
      day.estimatedHours += 20 / 60;
    }
    if (i > 0 && i % 7 === 0) {
      day.review.push({ kind: "weekly-review", minutes: 30, label: "Weekly sweep — past 7 days" });
      day.estimatedHours += 0.5;
    }
  }
}

/* ============================ §7 bottleneck detection ============================ */

/** §7 — exported so callers building their own PlanDay[] (e.g. a manually-authored
 *  schedule) can run the same bottleneck analysis without going through generateStudyPlan. */
export function detectBottlenecks(days: PlanDay[]): Bottleneck[] {
  const contentDays = days.filter((d) => d.items.length > 0).sort((a, b) => a.date.getTime() - b.date.getTime());
  const bottlenecks: Bottleneck[] = [];
  if (contentDays.length === 0) return bottlenecks;

  const avgWeight = contentDays.reduce((s, d) => s + d.totalWeight, 0) / contentDays.length;

  let streakStart = 0;
  for (let i = 1; i <= contentDays.length; i++) {
    const continuesStreak =
      i < contentDays.length &&
      contentDays[i].discipline === contentDays[i - 1].discipline &&
      !contentDays[i].discipline.includes(" + ");
    if (!continuesStreak) {
      const streakLen = i - streakStart;
      const streakDiscipline = contentDays[streakStart].discipline;
      if (streakLen >= 3 && !streakDiscipline.includes(" + ")) {
        bottlenecks.push({
          type: "dense-discipline-streak",
          discipline: streakDiscipline,
          startDate: contentDays[streakStart].date,
          endDate: contentDays[i - 1].date,
          message: `${streakLen} days in a row of ${streakDiscipline} (${dateKey(contentDays[streakStart].date)} – ${dateKey(
            contentDays[i - 1].date,
          )}) — plan a break or interleave review.`,
        });
      }
      streakStart = i;
    }
  }

  for (const day of contentDays) {
    if (avgWeight > 0 && day.totalWeight > avgWeight * 1.2) {
      bottlenecks.push({
        type: "overloaded-day",
        discipline: day.discipline,
        startDate: day.date,
        endDate: day.date,
        message: `${dateKey(day.date)} carries ${round1(day.totalWeight)} weight vs a plan average of ${round1(
          avgWeight,
        )} — expect this day to run long.`,
      });
    }
  }

  bottlenecks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return bottlenecks;
}

/* ============================ §9 slippage handling ============================ */

export type SlippageCheck =
  | { behind: false }
  | { behind: true; missedCount: number; feasibility: FeasibilityResult };

/** Re-runs the §2 feasibility check against whatever remains once a user falls behind. */
export function checkSlippage(config: PlanConfig, completedLectureIds: Set<string>, asOf: Date): SlippageCheck {
  const plan = generateStudyPlan(config);
  const asOfMidnight = atMidnight(asOf);
  const missed = plan.days
    .filter((d) => d.date < asOfMidnight)
    .flatMap((d) => d.items)
    .filter((l) => !completedLectureIds.has(l.id));

  if (missed.length === 0) return { behind: false };

  const remaining = config.lectures.filter((l) => !completedLectureIds.has(l.id));
  const feasibility = checkFeasibility({ ...config, lectures: remaining, startDate: asOf });
  return { behind: true, missedCount: missed.length, feasibility };
}

/** Rebalances the remaining lectures across the remaining days, preserving every rule above. */
export function redistributePlan(config: PlanConfig, completedLectureIds: Set<string>, asOf: Date): StudyPlan {
  const remaining = config.lectures.filter((l) => !completedLectureIds.has(l.id));
  return generateStudyPlan({ ...config, lectures: remaining, startDate: asOf });
}

/* =============================== date helpers =============================== */

function atMidnight(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const n2 = new Date(d);
  n2.setDate(n2.getDate() + n);
  return n2;
}

function enumerateDates(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const s = atMidnight(start);
  const e = atMidnight(end);
  for (let d = new Date(s); d <= e; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

function computeAvailableDates(config: PlanConfig): Date[] {
  const unavailable = new Set((config.unavailableDays ?? []).map((d) => dateKey(d)));
  return enumerateDates(config.startDate, config.deadline).filter((d) => !unavailable.has(dateKey(d)));
}

function addAvailableDays(start: Date, neededCount: number, unavailableDays: Date[]): Date {
  if (neededCount <= 0) return atMidnight(start);
  const unavailable = new Set(unavailableDays.map((d) => dateKey(d)));
  let cursor = atMidnight(start);
  let count = 0;
  // Bounded by construction: unavailableDays is a finite set, so an available
  // day is found within unavailableDays.size + neededCount iterations.
  const maxIterations = neededCount + unavailable.size + 1;
  for (let i = 0; i < maxIterations; i++) {
    if (!unavailable.has(dateKey(cursor))) {
      count++;
      if (count === neededCount) return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

function sortByOriginalOrder(lectures: Lecture[]): Lecture[] {
  return [...lectures].sort((a, b) => a.originalOrder - b.originalOrder);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}
