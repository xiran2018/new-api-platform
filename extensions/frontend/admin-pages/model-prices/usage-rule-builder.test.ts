import { describe, expect, it } from "vitest";

import { compileBillingExpression } from "@/features/pricing/lib/billing-expression/parser";
import { evaluateBillingExpression } from "@/features/pricing/lib/billing-expression/runtime";

import {
  BILLING_TEMPLATE_KEYS,
  createUsageRuleTemplate,
  usageRuleSetExpression,
  validateUsageRuleSet,
} from "./usage-rule-builder";

describe("screenshot-derived billing templates", () => {
  it("keeps every supported visual template valid and executable", () => {
    expect(BILLING_TEMPLATE_KEYS).toEqual([
      "image",
      "boolean",
      "volume",
      "video",
      "videoAudio",
      "videoMode",
      "imageVideo",
      "audioSeconds",
      "ttsCharacters",
      "voiceCount",
      "taskMatrix",
      "blank",
    ]);

    for (const key of BILLING_TEMPLATE_KEYS) {
      const rules = createUsageRuleTemplate(key, "request");
      expect(validateUsageRuleSet(rules), key).toBe("");
      const expression = usageRuleSetExpression(rules);
      expect(compileBillingExpression(expression), key).toMatchObject({
        status: "ready",
      });
      expect(
        evaluateBillingExpression(expression, {
          request: { body: {} },
          usage: {
            resolution: "1080P",
            resolution_tier: "2K",
            quality: "standard",
            mode: "wan-std",
            prompt_extend: false,
            audio: false,
            input_images: 1,
            output_images: 1,
            seconds: 1,
            characters: 1,
            tts_input_characters: 1,
            tts_output_characters: 1,
            count: 1,
            task_type: "text-to-3d",
            output_spec: "standard-no-texture",
          },
        }),
        key,
      ).toMatchObject({ status: "success" });
    }
  });
});
