import { describe, expect, it } from "vitest";

import type { UsageRuleSet } from "./types";
import {
  AUDIO_DURATION_PRICE_FRACTION_DIGITS,
  DEFAULT_PRICE_FRACTION_DIGITS,
  formatPriceDecimal,
  isAudioDurationPriceField,
  isAudioDurationUsageRuleSet,
} from "./price-precision";

describe("price display precision", () => {
  it("preserves audio duration prices through six decimal places", () => {
    expect(
      formatPriceDecimal(0.00022, AUDIO_DURATION_PRICE_FRACTION_DIGITS),
    ).toBe("0.00022");
    expect(
      formatPriceDecimal(0.00002, AUDIO_DURATION_PRICE_FRACTION_DIGITS),
    ).toBe("0.00002");
  });

  it("keeps the existing three-decimal behavior for other prices", () => {
    expect(
      formatPriceDecimal(0.00022, DEFAULT_PRICE_FRACTION_DIGITS),
    ).toBe("0.000");
    expect(isAudioDurationPriceField("audioDuration")).toBe(true);
    expect(isAudioDurationPriceField("aud_s")).toBe(true);
    expect(isAudioDurationPriceField("videoOutput")).toBe(false);
  });

  it("does not treat video seconds pricing as audio duration pricing", () => {
    const audioRules: UsageRuleSet = {
      version: 1,
      execution: "request",
      rules: [{
        id: "audio",
        label: "Audio duration",
        conditions: [],
        charges: [{ meter: "seconds", unit: "秒", price: 0.00022 }],
      }],
    };
    const videoRules: UsageRuleSet = {
      version: 1,
      execution: "request",
      rules: [{
        id: "video",
        label: "720P",
        conditions: [{ field: "resolution", operator: "eq", value: "720P" }],
        charges: [{ meter: "seconds", unit: "秒", price: 0.00022 }],
      }],
    };

    expect(isAudioDurationUsageRuleSet(audioRules)).toBe(true);
    expect(isAudioDurationUsageRuleSet(videoRules)).toBe(false);
  });
});
