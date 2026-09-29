import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/core/config";
import { storeName } from "../src/core/store";

describe("config", () => {
  it("defaults today to the assessment date", () => {
    expect(loadConfig({}).today).toBe("2026-10-06");
  });
  it("rejects a malformed APP_TODAY", () => {
    expect(() => loadConfig({ APP_TODAY: "06/10/2026" })).toThrow();
  });
  it("parses an APP_NOW override", () => {
    expect(loadConfig({ APP_NOW: "2026-10-06T19:30:00+02:00" }).nowOverride?.toISOString()).toBe(
      "2026-10-06T17:30:00.000Z",
    );
  });
});

describe("storeName", () => {
  it("prefixes with the deploy context so previews never touch production data", () => {
    expect(storeName("conversations", "production")).toBe("production-conversations");
    expect(storeName("conversations", "deploy-preview")).toBe("deploy-preview-conversations");
  });
  it("falls back to dev and strips forbidden characters", () => {
    expect(storeName("audit", undefined)).toBe("dev-audit");
    expect(storeName("a/b:c", "production")).toBe("production-a-b-c");
  });
});
