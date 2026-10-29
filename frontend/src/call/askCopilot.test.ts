import { describe, expect, it } from "vitest";
import { buildCallMessage, nodePath, WENT_WRONG } from "./askCopilot";
import type { TranscriptEntry } from "./callStore";

const call: TranscriptEntry[] = [
  { kind: "note", text: "Started at greeting" },
  { kind: "agent", text: "Hello, how can I help?" },
  { kind: "user", text: "I need to book a visit." },
  { kind: "note", text: "Moved to collect_info via start_booking (reason: checkup)" },
  { kind: "agent", text: "What is your date of birth?" },
  { kind: "note", text: "Moved to end via finish" },
];

describe("nodePath", () => {
  it("lists the nodes from the transition notes in order", () => {
    expect(nodePath(call)).toEqual(["greeting", "collect_info", "end"]);
  });
  it("is empty without notes", () => {
    expect(nodePath([{ kind: "user", text: "hi" }])).toEqual([]);
  });
});

describe("buildCallMessage", () => {
  const message = buildCallMessage(call);
  it("includes the spoken lines and skips the notes", () => {
    expect(message).toContain("Caller: I need to book a visit.");
    expect(message).toContain("Agent: What is your date of birth?");
    expect(message).not.toContain("Moved to collect_info");
  });
  it("includes the node path", () => {
    expect(message).toContain("Path: greeting -> collect_info -> end");
  });
  it("ends with the open question so the cursor lands after it", () => {
    expect(message.endsWith(WENT_WRONG)).toBe(true);
    expect(WENT_WRONG).toBe("What went wrong: ");
  });
  it("omits the path line when no node was visited", () => {
    expect(buildCallMessage([{ kind: "user", text: "hi" }])).not.toContain("Path:");
  });
});
