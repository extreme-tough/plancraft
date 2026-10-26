import { describe, expect, it } from "vitest";
import { dependentsOf, describeCycle, findCycle, topologicalOrder } from "@/domain/graph";
import { computeSchedule, nextUp, progressPercent } from "@/domain/schedule";
import { makePlan, makeTask } from "../support/factories";

const EVENT = "2027-02-21";

function chain(tastingLead = 30) {
  return makePlan({
    eventDate: EVENT,
    tasks: [
      makeTask({ id: "venue", title: "Book venue", leadTimeDays: 90, durationDays: 7, priority: "high" }),
      makeTask({ id: "caterer", title: "Book caterer", leadTimeDays: 60, durationDays: 10, dependsOn: ["venue"] }),
      makeTask({ id: "tasting", title: "Menu tasting", leadTimeDays: tastingLead, durationDays: 3, dependsOn: ["caterer"] }),
    ],
  });
}

describe("deadlines counted back from the event (EM-46)", () => {
  it("uses each task's lead time when nothing later is tighter", () => {
    const schedule = computeSchedule(chain(), "2026-10-25");
    expect(schedule.get("tasting")?.deadline).toBe("2027-01-22"); // event − 30
    expect(schedule.get("caterer")?.deadline).toBe("2026-12-23"); // event − 60
    expect(schedule.get("venue")?.deadline).toBe("2026-11-23"); // event − 90
    expect(schedule.get("venue")?.latestStart).toBe("2026-11-16");
  });

  it("pulls a deadline earlier when a dependent task needs the time", () => {
    // Tasting due event − 62 = 21 Dec and takes 3 days, so the caterer must be booked by 18 Dec.
    const schedule = computeSchedule(chain(62), "2026-10-25");
    expect(schedule.get("tasting")?.deadline).toBe("2026-12-21");
    expect(schedule.get("caterer")?.deadline).toBe("2026-12-18");
  });

  it("marks tasks on track, tight or overdue against today", () => {
    expect(computeSchedule(chain(), "2026-11-10").get("venue")?.status).toBe("on_track");
    expect(computeSchedule(chain(), "2026-11-20").get("venue")?.status).toBe("tight");
    expect(computeSchedule(chain(), "2026-11-24").get("venue")?.status).toBe("overdue");
  });

  it("never drops a task whose lead time is longer than the planning window", () => {
    const schedule = computeSchedule(chain(), "2027-02-01");
    expect(schedule.size).toBe(3);
    expect([...schedule.values()].every((s) => s.status === "overdue")).toBe(true);
  });

  it("reports done tasks as done", () => {
    const plan = chain();
    const done = { ...plan, tasks: plan.tasks.map((t) => (t.id === "venue" ? { ...t, status: "done" as const } : t)) };
    expect(computeSchedule(done, "2026-11-24").get("venue")?.status).toBe("done");
  });
});

describe("forward pass and availability (EM-24, EM-25)", () => {
  it("flags dependents at risk when a late task pushes them past their deadline", () => {
    const schedule = computeSchedule(chain(), "2026-11-20");
    expect(schedule.get("venue")).toMatchObject({ earliestFinish: "2026-11-27", atRisk: true });
    expect(schedule.get("caterer")).toMatchObject({ earliestFinish: "2026-12-07", atRisk: false });
  });

  it("makes a task available once all its dependencies are done", () => {
    const plan = chain();
    expect(computeSchedule(plan, "2026-10-25").get("caterer")?.available).toBe(false);
    const venueDone = { ...plan, tasks: plan.tasks.map((t) => (t.id === "venue" ? { ...t, status: "done" as const } : t)) };
    const schedule = computeSchedule(venueDone, "2026-10-25");
    expect(schedule.get("caterer")?.available).toBe(true);
    expect(schedule.get("venue")?.available).toBe(false);
    expect(schedule.get("venue")?.earliestFinish).toBeNull();
  });

  it("lists what to do next by deadline, then priority (EM-26)", () => {
    const plan = makePlan({
      eventDate: EVENT,
      tasks: [
        makeTask({ id: "a", leadTimeDays: 30, priority: "low" }),
        makeTask({ id: "b", leadTimeDays: 30, priority: "high" }),
        makeTask({ id: "c", leadTimeDays: 90 }),
        makeTask({ id: "d", leadTimeDays: 10 }),
        makeTask({ id: "blocked", leadTimeDays: 100, dependsOn: ["d"] }),
      ],
    });
    // "d" looks late (lead 10) but "blocked" needs it done 107 days out, so it comes first.
    expect(nextUp(plan, "2026-10-25").map((t) => t.id)).toEqual(["d", "c", "b"]);
  });

  it("calculates progress", () => {
    const plan = chain();
    expect(progressPercent(plan.tasks)).toBe(0);
    expect(progressPercent([{ ...plan.tasks[0]!, status: "done" }, ...plan.tasks.slice(1)])).toBe(33);
    expect(progressPercent([])).toBe(0);
  });
});

describe("dependency graph (EM-45)", () => {
  const nodes = [
    { id: "a", dependsOn: ["c"] },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["b"] },
  ];

  it("finds a loop and names it", () => {
    const cycle = findCycle(nodes);
    expect(cycle).not.toBeNull();
    expect(cycle?.[0]).toBe(cycle?.at(-1));
    expect(describeCycle(["a", "b", "a"], (id) => id.toUpperCase())).toBe("A → B → A");
  });

  it("finds a task that depends on itself", () => {
    expect(findCycle([{ id: "a", dependsOn: ["a"] }])).toEqual(["a", "a"]);
  });

  it("finds no loop in a valid graph and ignores unknown ids", () => {
    expect(findCycle([{ id: "a", dependsOn: [] }, { id: "b", dependsOn: ["a", "ghost"] }])).toBeNull();
  });

  it("orders dependencies first, and refuses a loop", () => {
    const order = topologicalOrder([{ id: "b", dependsOn: ["a"] }, { id: "a", dependsOn: [] }]);
    expect(order.map((n) => n.id)).toEqual(["a", "b"]);
    expect(() => topologicalOrder(nodes)).toThrow();
  });

  it("lists every task that depends on a task, so the picker can grey them out", () => {
    const tree = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["b"] },
      { id: "d", dependsOn: [] },
    ];
    expect(dependentsOf(tree, "a")).toEqual(new Set(["b", "c"]));
    expect(dependentsOf(tree, "d")).toEqual(new Set());
  });
});
