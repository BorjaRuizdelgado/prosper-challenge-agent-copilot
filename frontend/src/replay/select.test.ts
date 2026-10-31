import { describe, expect, it } from "vitest";
import type { Finding, Run, RunOutcome } from "../model";
import type { ReplayResult } from "./client";
import { scoreReplay, selectRuns } from "./select";

const run = (id: string, outcome: RunOutcome, started_at = "2026-01-01T00:00:00Z", flag?: string): Run => ({
  id,
  outcome,
  started_at,
  duration_s: 1,
  transcript: [],
  path: [],
  ...(flag && { flag }),
});
const result = (outcome: RunOutcome, goal_met: boolean): ReplayResult => ({ transcript: [], path: [], outcome, goal_met, reason: "" });
const finding = (...runs: string[]): Finding => ({ title: "t", runs, cause: "c", fix: "f" });
const ids = (rs: Run[]) => rs.map((r) => r.id);

describe("selectRuns", () => {
  const runs = [
    run("ok1", "completed", "2026-01-01"),
    run("ok2", "transferred", "2026-01-05"),
    run("ok3", "completed", "2026-01-03"),
    run("ok4", "completed", "2026-01-04"),
    run("flagged", "completed", "2026-01-06", "wrong"),
    run("ab", "abandoned"),
    run("st", "stuck"),
  ];

  it("with findings: cited runs once each, then the 3 newest that worked", () => {
    expect(ids(selectRuns([finding("ab", "nope"), finding("ab", "flagged")], runs))).toEqual(["ab", "flagged", "ok2", "ok4", "ok3"]);
  });

  it("never repeats a cited run among the working ones", () => {
    expect(ids(selectRuns([finding("ok2")], runs))).toEqual(["ok2", "ok4", "ok3", "ok1"]);
  });

  it("without findings: flagged, abandoned and stuck runs", () => {
    expect(ids(selectRuns(undefined, runs))).toEqual(["flagged", "ab", "st"]);
    expect(ids(selectRuns([], runs))).toEqual(["flagged", "ab", "st"]);
  });
});

describe("scoreReplay", () => {
  const runs = [run("ab", "abandoned"), run("fl", "completed", undefined, "bad"), run("ok", "completed"), run("tr", "transferred")];
  const classes = (results: Parameters<typeof scoreReplay>[1]) => scoreReplay(runs, results).classes;

  it("fixed, unfixed, kept and broken", () => {
    const s = scoreReplay(runs, {
      ab: { before: result("abandoned", false), after: result("completed", true) },
      fl: { before: result("stuck", false), after: result("completed", false) },
      ok: { before: result("completed", true), after: result("completed", true) },
      tr: { before: result("completed", true), after: result("stuck", false) },
    });
    expect(s.classes).toEqual({ ab: "fixed", fl: "unfixed", ok: "kept", tr: "broken" });
    expect(s).toMatchObject({ fixed: 1, failing: 2, kept: 1, working: 2, broken: 1, notReproduced: 0 });
  });

  it("a failing run whose before meets the goal is not reproduced, and not counted as fixed or failing", () => {
    const s = scoreReplay(runs, { ab: { before: result("completed", true), after: result("completed", true) } });
    expect(s.classes.ab).toBe("not_reproduced");
    expect(s).toMatchObject({ fixed: 0, failing: 0, notReproduced: 1 });
  });

  it("a working run whose goal was not met before or after, with the same outcome, is kept", () => {
    expect(classes({ tr: { before: result("transferred", false), after: result("transferred", false) } }).tr).toBe("kept");
  });

  it("a working run is broken when after is worse than before, or ends differently", () => {
    expect(classes({ tr: { before: result("transferred", true), after: result("transferred", false) } }).tr).toBe("broken");
    expect(classes({ tr: { before: result("transferred", false), after: result("stuck", false) } }).tr).toBe("broken");
  });

  it("a working run with no before result is judged on after alone", () => {
    expect(classes({ tr: { after: result("transferred", false) } }).tr).toBe("broken");
  });

  it("a goal met on an abandoned replay does not count as met", () => {
    expect(classes({ ab: { after: result("abandoned", true) } }).ab).toBe("unfixed");
  });

  it("is pending until after has a result", () => {
    expect(classes({ ab: { before: result("stuck", false) }, ok: {} })).toMatchObject({ ab: "pending", ok: "pending", tr: "pending" });
  });
});
