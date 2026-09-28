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
});
