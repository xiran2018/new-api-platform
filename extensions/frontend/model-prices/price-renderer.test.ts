import { describe, expect, it } from "vitest";

import { expressionPriceBlocks } from "./price-renderer";
import { PLATFORM_BILLING_PRESET_GROUPS } from "./expression-presets";

describe("expression price display", () => {
  it("derives visible blocks from request-body thinking branches", () => {
    const blocks = expressionPriceBlocks(
      '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking", c * 10.8) : tier("non-thinking", c * 9.6))',
    );
    expect(blocks).toHaveLength(2);
    expect(blocks?.map(({ label, input, output }) => ({ label, input, output }))).toEqual([
      { label: "thinking", input: 1.8, output: 10.8 },
      { label: "non-thinking", input: 1.8, output: 9.6 },
    ]);
  });

  it("derives displayable prices for every platform expression preset", () => {
    for (const group of PLATFORM_BILLING_PRESET_GROUPS) {
      for (const preset of group.presets) {
        const blocks = expressionPriceBlocks(preset.expr);
        expect(blocks, preset.key).not.toBeNull();
        expect(blocks?.some((block) =>
          Object.entries(block).some(([key, value]) =>
            ["input", "output", "cache", "createCache", "createCache1h", "image", "imageOutput", "audioInput", "audioOutput", "audioDuration", "videoInput", "videoOutput", "multimodalOutput"].includes(key) &&
            typeof value === "number" && value !== 0,
          ),
        ), preset.key).toBe(true);
      }
    }
  });
});
