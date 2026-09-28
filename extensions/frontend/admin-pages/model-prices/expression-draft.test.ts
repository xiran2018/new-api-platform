import { describe, expect, it } from "vitest";

import {
  createBillingExpressionDraft,
  updateBillingExpressionDraft,
} from "./expression-draft";

describe("billing expression draft", () => {
  it.each([
    [
      "audio input and audio output",
      "tier(\"audio input + audio output token pricing\", ai * 3.5 + ao * 21)",
    ],
    [
      "audio input and text output",
      "tier(\"audio input + text output token pricing\", ai * 3.5 + c * 21)",
    ],
  ])(
    "keeps the %s template when the editor updates request rules immediately afterwards",
    (_label, expression) => {
      const draft = createBillingExpressionDraft("");

      updateBillingExpressionDraft(draft, "billingExpr", expression);
      const saved = updateBillingExpressionDraft(
        draft,
        "requestRuleExpr",
        "",
      );

      expect(saved).toBe(expression);
    },
  );

  it("preserves an existing request rule when a preset replaces the billing expression", () => {
    const requestRules = '(param("enable_thinking") == true ? 2 : 1)';
    const draft = createBillingExpressionDraft(
      `p * 1 * ${requestRules}`,
    );
    const expression =
      'tier("audio input + audio output token pricing", ai * 3.5 + ao * 21)';

    updateBillingExpressionDraft(draft, "billingExpr", expression);

    expect(draft.source).toBe(`(${expression}) * ${requestRules}`);
    expect(draft.requestRuleExpr).toBe(requestRules);
  });
});
