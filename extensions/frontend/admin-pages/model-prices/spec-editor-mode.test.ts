import { describe, expect, it } from "vitest";

import { specEditorMode } from "./spec-editor-mode";

describe("specEditorMode", () => {
  it("reopens saved advanced media pricing in the media editor", () => {
    expect(specEditorMode({
      mode: "expression",
      blocks: [{
        baseExpression: 'tier("Audio duration", u("seconds") * 0.00022)',
        usageRuleSet: {
          version: 1,
          execution: "request",
          rules: [{
            id: "audio-duration",
            label: "Audio duration",
            conditions: [],
            charges: [{ meter: "seconds", unit: "秒", price: 0.00022 }],
          }],
        },
      }],
    })).toBe("media");
  });

  it("keeps ordinary expressions and legacy modes unchanged", () => {
    expect(specEditorMode({ mode: "expression", blocks: [] })).toBe("expression");
    expect(specEditorMode({ mode: "token", blocks: [] })).toBe("token");
    expect(specEditorMode({ mode: "request", blocks: [] })).toBe("request");
  });
});
