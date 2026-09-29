import { describe, expect, it } from "vitest";
import phoneCases from "../data/contract/phone-cases.json";
import { loadContract } from "../src/core/contract";
import { memoryConversationStore, newId } from "../src/core/conversation-store";
import { isWithinAgentHours, nextAgentAvailability } from "../src/core/hours";
import { maskIdLast4, maskPhone, redactSensitive } from "../src/core/masking";
import { normalisePhone } from "../src/core/phone";

describe("phone normalisation matches the Python ingest (shared fixtures)", () => {
  for (const { raw, normalised } of phoneCases) {
    it(`"${raw}" -> ${normalised}`, () => expect(normalisePhone(raw)).toBe(normalised));
  }
});

describe("data contract", () => {
  const contract = loadContract();
  it("loads the generated files with the expected counts", () => {
    expect(contract.loans).toHaveLength(150);
    expect(contract.payments).toHaveLength(32);
    expect(contract.allocations).toHaveLength(32);
    expect(contract.chunks.length).toBeGreaterThan(30);
  });
  it("stores money as integer thebe", () => {
    for (const loan of contract.loans) expect(Number.isInteger(loan.outstanding_balance_thebe)).toBe(true);
  });
  it("every loan has a usable phone for verification", () => {
    for (const loan of contract.loans) expect(loan.phone_normalised).toMatch(/^7\d{7}$/);
  });
  it("flags the superseded 2023 late-payment rules", () => {
    const superseded = contract.chunks.filter((c) => c.superseded).map((c) => c.document);
    expect(superseded).toContain("penalties.docx");
    expect(superseded).not.toContain("late-payment-policy.pdf");
  });
});

describe("agent hours (Botswana time, UTC+2)", () => {
  it("Tuesday 10:00 Botswana is within hours", () => {
    expect(isWithinAgentHours(new Date("2026-10-06T10:00:00+02:00"))).toBe(true);
  });
  it("Tuesday 19:30 Botswana is outside hours; next is tomorrow 08:00", () => {
    const evening = new Date("2026-10-06T19:30:00+02:00");
    expect(isWithinAgentHours(evening)).toBe(false);
    expect(nextAgentAvailability(evening)).toBe("tomorrow at 08:00");
  });
  it("Saturday 14:00 → Monday at 08:00 (closed Sunday)", () => {
    expect(nextAgentAvailability(new Date("2026-10-10T14:00:00+02:00"))).toBe("Monday at 08:00");
  });
  it("uses Botswana time, not UTC: 07:30 UTC is 09:30 in Gaborone", () => {
    expect(isWithinAgentHours(new Date("2026-10-06T07:30:00Z"))).toBe(true);
  });
});

describe("masking", () => {
  it("masks phone and ID digits", () => {
    expect(maskPhone("71084258")).toBe("71•••258");
    expect(maskIdLast4("4821")).toBe("••21");
  });
  it("redacts phone numbers and 4-digit groups from free text", () => {
    expect(redactSensitive("my number is 71 555 204 and id 4821")).toBe(
      "my number is [phone removed] and id [digits removed]",
    );
  });
});

describe("conversation store (in-memory)", () => {
  it("keeps every message even when two are appended at once, in order", async () => {
    const store = memoryConversationStore();
    const a = { id: newId(new Date("2026-10-06T10:00:00Z")), role: "customer" as const, type: "text" as const, text: "hi", createdAt: "" };
    const b = { id: newId(new Date("2026-10-06T10:00:01Z")), role: "agent" as const, type: "text" as const, text: "hello", createdAt: "" };
    await Promise.all([store.appendMessage("c1", b), store.appendMessage("c1", a)]);
    expect((await store.listMessages("c1")).map((m) => m.text)).toEqual(["hi", "hello"]);
    expect((await store.listMessages("c1", a.id)).map((m) => m.text)).toEqual(["hello"]);
  });
});
