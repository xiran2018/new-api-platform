import { describe, expect, it } from "vitest";

import { expressionPriceBlocks } from "./price-renderer";

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
});
