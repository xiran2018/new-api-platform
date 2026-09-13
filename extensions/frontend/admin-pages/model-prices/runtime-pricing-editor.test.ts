import { describe, expect, it } from "vitest";

import { applyPricingDiscount } from "./runtime-pricing-editor";

describe("applyPricingDiscount", () => {
  it("scales a fixed request leaf without wrapping the expression", () => {
    const result = applyPricingDiscount(
      {
        name: "MiniMax-M2",
        billingMode: "tiered_expr",
        billingExpr: 'tier("request", fixed(10))',
      },
      9,
    );

    expect(result.billingExpr).toBe('tier("request", fixed(9.1))');
    expect(result.billingExpr).not.toContain(") * 0.91");
  });

  it("scales every visual token price", () => {
    const result = applyPricingDiscount(
      {
        name: "token-model",
        billingMode: "tiered_expr",
        billingExpr: 'tier("base", p * 2 + c * 8)',
      },
      10,
    );

    expect(result.billingExpr).toContain("p * 1.8");
    expect(result.billingExpr).toContain("c * 7.2");
  });
});
