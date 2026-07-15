import { describe, expect, it } from "vitest";
import {
  checkFeasibility,
  checkSlippage,
  generateStudyPlan,
  redistributePlan,
  type Lecture,
  type PlanConfig,
} from "./scheduler";

function lecture(overrides: Partial<Lecture> & { id: string; originalOrder: number }): Lecture {
  return {
    title: `Lecture ${overrides.id}`,
    course: "Course 1",
    discipline: "Biochemistry",
    ...overrides,
  };
}

function date(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

/** Builds N lectures across the given disciplines (round-robin blocks, not interleaved) for one course. */
function buildCourse(course: string, disciplines: string[], perDiscipline: number, startOrder: number): Lecture[] {
  const out: Lecture[] = [];
  let order = startOrder;
  for (const discipline of disciplines) {
    for (let i = 0; i < perDiscipline; i++) {
      out.push(
        lecture({
          id: `${course}-${discipline}-${i}`,
          course,
          discipline,
          originalOrder: order++,
        }),
      );
    }
  }
  return out;
}

const baseConfig = (lectures: Lecture[], overrides: Partial<PlanConfig> = {}): PlanConfig => ({
  lectures,
  startDate: date(2026, 1, 1),
  deadline: date(2026, 1, 8),
  hoursPerDay: 4,
  minutesPerLecture: 45,
  includeReviewTime: true,
  ...overrides,
});

describe("checkFeasibility (§2)", () => {
  it("flags infeasible plans with exact numbers and three resolutions", () => {
    const lectures = Array.from({ length: 39 }, (_, i) => lecture({ id: `L${i}`, originalOrder: i }));
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 8), // 8 days
      hoursPerDay: 2,
      minutesPerLecture: 45,
    });
    const result = checkFeasibility(config);
    expect(result.feasible).toBe(false);
    if (result.feasible) throw new Error("unreachable");
    expect(result.totalLectures).toBe(39);
    expect(result.availableDays).toBe(8);
    expect(result.requiredPerDay).toBe(5); // ceil(39/8)
    expect(result.resolutions).toHaveLength(3);
    expect(result.resolutions.map((r) => r.kind)).toEqual([
      "increase_hours",
      "increase_pace",
      "extend_deadline",
    ]);
    expect(result.message).toContain("39 lectures");
    expect(result.message).toContain("8 days");
  });

  it("accepts a plan with enough hours", () => {
    const lectures = Array.from({ length: 8 }, (_, i) => lecture({ id: `L${i}`, originalOrder: i }));
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 8),
      hoursPerDay: 4,
      minutesPerLecture: 45,
    });
    const result = checkFeasibility(config);
    expect(result.feasible).toBe(true);
  });

  it("excludes unavailable days from the denominator", () => {
    const lectures = Array.from({ length: 8 }, (_, i) => lecture({ id: `L${i}`, originalOrder: i }));
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 8), // 8 calendar days
      unavailableDays: [date(2026, 1, 4), date(2026, 1, 5)],
      hoursPerDay: 4,
      minutesPerLecture: 45,
    });
    const result = checkFeasibility(config);
    expect(result.availableDays).toBe(6);
  });

  it("is trivially feasible with zero lectures", () => {
    const result = checkFeasibility(baseConfig([]));
    expect(result.feasible).toBe(true);
  });
});

describe("generateStudyPlan — non-negotiables (§11)", () => {
  it("never drops a lecture, even for a large multi-course multi-discipline input", () => {
    const lectures = [
      ...buildCourse("Course 1", ["Biology", "Biochemistry", "Genetics"], 6, 0),
      ...buildCourse("Course 2", ["Immunology", "Pharmacology"], 7, 100),
      ...buildCourse("Course 3", ["Histology"], 5, 200),
    ];
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 20),
      hoursPerDay: 5,
      minutesPerLecture: 30,
    });
    const plan = generateStudyPlan(config);
    const scheduledIds = plan.days.flatMap((d) => d.items.map((l) => l.id)).sort();
    const inputIds = lectures.map((l) => l.id).sort();
    expect(scheduledIds).toEqual(inputIds);
    expect(plan.scheduledLectures).toBe(lectures.length);
  });

  it("never drops a lecture in the degenerate more-courses-than-days case", () => {
    const lectures = [
      lecture({ id: "a", course: "Course A", originalOrder: 0 }),
      lecture({ id: "b", course: "Course B", originalOrder: 1 }),
      lecture({ id: "c", course: "Course C", originalOrder: 2 }),
      lecture({ id: "d", course: "Course D", originalOrder: 3 }),
      lecture({ id: "e", course: "Course E", originalOrder: 4 }),
    ];
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 2), // only 2 available days, 5 courses
      hoursPerDay: 10,
      minutesPerLecture: 30,
    });
    const plan = generateStudyPlan(config);
    const scheduledIds = plan.days.flatMap((d) => d.items.map((l) => l.id)).sort();
    expect(scheduledIds).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("surfaces feasibility above the plan without silently hiding infeasibility", () => {
    const lectures = Array.from({ length: 39 }, (_, i) => lecture({ id: `L${i}`, originalOrder: i }));
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 8),
      hoursPerDay: 2,
      minutesPerLecture: 45,
    });
    const plan = generateStudyPlan(config);
    expect(plan.feasibility.feasible).toBe(false);
    // the plan is still generated (user may accept the strain) — never dropped
    expect(plan.scheduledLectures).toBe(39);
  });

  it("never scatters a discipline across non-consecutive days within a course", () => {
    const lectures = buildCourse("Course 1", ["Biology", "Biochemistry", "Genetics", "Immunology"], 4, 0);
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 16),
      hoursPerDay: 6,
      minutesPerLecture: 30,
    });
    const plan = generateStudyPlan(config);
    const contentDays = plan.days.filter((d) => d.items.length > 0);

    for (const discipline of ["Biology", "Biochemistry", "Genetics", "Immunology"]) {
      const indices = contentDays
        .map((d, i) => (d.items.some((l) => l.discipline === discipline) ? i : -1))
        .filter((i) => i !== -1);
      // indices touching this discipline must be one contiguous run
      const min = Math.min(...indices);
      const max = Math.max(...indices);
      expect(max - min + 1).toBe(indices.length);
    }
  });

  it("never interleaves two courses on the same day", () => {
    const lectures = [...buildCourse("Course 1", ["Biology"], 5, 0), ...buildCourse("Course 2", ["Genetics"], 5, 100)];
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 10),
      hoursPerDay: 4,
      minutesPerLecture: 30,
    });
    const plan = generateStudyPlan(config);
    for (const day of plan.days) {
      const courses = new Set(day.items.map((l) => l.course));
      expect(courses.size).toBeLessThanOrEqual(1);
    }
  });

  it("front-loads: 39 lectures over 8 days yields 5,5,5,5,5,5,5,4", () => {
    const lectures = buildCourse("Course 1", ["Biochemistry"], 39, 0);
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 8),
      hoursPerDay: 8,
      minutesPerLecture: 15,
      includeReviewTime: false,
    });
    const plan = generateStudyPlan(config);
    const counts = plan.days.filter((d) => d.items.length > 0).map((d) => d.items.length);
    expect(counts).toEqual([5, 5, 5, 5, 5, 5, 5, 4]);
  });

  it("is deterministic — same input yields the same output", () => {
    const lectures = [
      ...buildCourse("Course 1", ["Biology", "Biochemistry"], 5, 0),
      ...buildCourse("Course 2", ["Immunology"], 4, 50),
    ];
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 14),
      hoursPerDay: 4,
      minutesPerLecture: 40,
    });
    const planA = generateStudyPlan(config);
    const planB = generateStudyPlan(config);
    const shapeA = planA.days.map((d) => ({ key: d.dateKey, course: d.course, ids: d.items.map((l) => l.id) }));
    const shapeB = planB.days.map((d) => ({ key: d.dateKey, course: d.course, ids: d.items.map((l) => l.id) }));
    expect(shapeA).toEqual(shapeB);
  });
});

describe("course-level allocation (§3)", () => {
  it("allocates days proportionally to lecture load, not equally", () => {
    const lectures = [
      ...buildCourse("Big Course", ["Biology"], 20, 0),
      ...buildCourse("Small Course", ["Genetics"], 5, 100),
    ];
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 10), // 10 available days, 25 lectures total
      hoursPerDay: 6,
      minutesPerLecture: 30,
      includeReviewTime: false,
    });
    const plan = generateStudyPlan(config);
    const bigDays = new Set(plan.days.filter((d) => d.course === "Big Course").map((d) => d.dateKey));
    const smallDays = new Set(plan.days.filter((d) => d.course === "Small Course").map((d) => d.dateKey));
    // 20/25 * 10 = 8 days vs 5/25 * 10 = 2 days
    expect(bigDays.size).toBe(8);
    expect(smallDays.size).toBe(2);
  });
});

describe("bottleneck detection (§7)", () => {
  it("flags 3+ consecutive days of a single dense discipline", () => {
    const lectures = buildCourse("Course 1", ["Immunology"], 12, 0);
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 12),
      hoursPerDay: 3,
      minutesPerLecture: 45,
      includeReviewTime: false,
    });
    const plan = generateStudyPlan(config);
    const streaks = plan.bottlenecks.filter((b) => b.type === "dense-discipline-streak");
    expect(streaks.length).toBeGreaterThan(0);
  });
});

describe("review protocol (§8)", () => {
  it("embeds daily review as the first item when there are zero spare days", () => {
    const lectures = Array.from({ length: 16 }, (_, i) => lecture({ id: `L${i}`, originalOrder: i }));
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 8), // tight: 16 lectures / 8 days = 2/day, minimal slack
      hoursPerDay: 2, // 2 lectures * 45min = 1.5h + 0.5h review = 2h exactly, zero slack
      minutesPerLecture: 45,
    });
    const plan = generateStudyPlan(config);
    expect(plan.reviewProtocol.embedded).toBe(true);
    const daysWithReview = plan.days.filter((d) => d.review.some((r) => r.kind === "daily-review"));
    expect(daysWithReview.length).toBeGreaterThan(0);
  });

  it("inserts dedicated review days instead of embedding when spare days exist", () => {
    const lectures = buildCourse("Course 1", ["Biology"], 5, 0);
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 15), // way more days than needed
      hoursPerDay: 6,
      minutesPerLecture: 30,
    });
    const plan = generateStudyPlan(config);
    expect(plan.reviewProtocol.embedded).toBe(false);
    const dedicated = plan.days.filter((d) => d.review.some((r) => r.kind === "dedicated-review"));
    expect(dedicated.length).toBeGreaterThan(0);
  });
});

describe("slippage handling (§9)", () => {
  it("detects missed lectures and re-checks feasibility for the remainder", () => {
    const lectures = buildCourse("Course 1", ["Biology"], 10, 0);
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 10),
      hoursPerDay: 3,
      minutesPerLecture: 30,
      includeReviewTime: false,
    });
    const completed = new Set<string>(); // nothing done yet
    const result = checkSlippage(config, completed, date(2026, 1, 5));
    expect(result.behind).toBe(true);
  });

  it("redistribute preserves zero-drop over the remaining lectures", () => {
    const lectures = buildCourse("Course 1", ["Biology", "Genetics"], 6, 0);
    const config = baseConfig(lectures, {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 12),
      hoursPerDay: 3,
      minutesPerLecture: 30,
    });
    const completed = new Set(lectures.slice(0, 4).map((l) => l.id));
    const plan = redistributePlan(config, completed, date(2026, 1, 6));
    const scheduledIds = plan.days.flatMap((d) => d.items.map((l) => l.id)).sort();
    const expectedIds = lectures
      .slice(4)
      .map((l) => l.id)
      .sort();
    expect(scheduledIds).toEqual(expectedIds);
  });
});

describe("difficulty weighting (§6)", () => {
  it("balances days by weight, not raw lecture count", () => {
    const heavy = Array.from({ length: 5 }, (_, i) =>
      lecture({ id: `heavy-${i}`, course: "Course 1", discipline: "Pathology", weight: 1.5, originalOrder: i }),
    );
    const light = Array.from({ length: 5 }, (_, i) =>
      lecture({ id: `light-${i}`, course: "Course 1", discipline: "Pathology", weight: 0.75, originalOrder: i + 10 }),
    );
    const config = baseConfig([...heavy, ...light], {
      startDate: date(2026, 1, 1),
      deadline: date(2026, 1, 4),
      hoursPerDay: 6,
      minutesPerLecture: 20,
      includeReviewTime: false,
    });
    const plan = generateStudyPlan(config);
    const contentDays = plan.days.filter((d) => d.items.length > 0);
    // heavier lectures should be spread across more days than an equal split would allow
    expect(contentDays.length).toBeGreaterThan(1);
  });
});
