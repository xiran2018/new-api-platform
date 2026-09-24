import { describe, expect, it } from "vitest";

import {
  activeUsageRuleSetForDraft,
  applyPricingDiscount,
  runtimeDisplaySpec,
  vendorComparisonValue,
  vendorEditorData,
} from "./runtime-pricing-editor";
import type { PriceSpec, UsageRuleSet } from "../../model-prices/types";

import { PLATFORM_BILLING_PRESET_GROUPS } from "@/platform/model-prices/expression-presets";
import { compileBillingExpression } from "@/features/pricing/lib/billing-expression/parser";
import {
  parseVisualBillingDocument,
  type VisualPricingNode,
} from "@/features/pricing/lib/billing-expression/visual";
import { matchingUsageRuleSet } from "../../model-prices/usage-rule-expression";

function visualTierLabels(node: VisualPricingNode): string[] {
  return node.kind === "tier"
    ? [node.label]
    : [...visualTierLabels(node.yes), ...visualTierLabels(node.no)];
}

const advancedRuleSet: UsageRuleSet = {
  version: 1,
  execution: "request",
  rules: [
    {
      id: "default",
      label: "Default image",
      conditions: [],
      charges: [{ meter: "image_count", unit: "张", price: 0.5 }],
    },
  ],
};

describe("pricing mode metadata", () => {
  const advancedExpression =
    'tier("Default image", fixed(0.5)) * image_count';

  it("keeps advanced rules only while the advanced pricing tab is active", () => {
    const draft = {
      name: "image-model",
      billingMode: "tiered_expr" as const,
      billingExpr: advancedExpression,
    };

    expect(activeUsageRuleSetForDraft(true, advancedRuleSet, draft))
      .toBe(advancedRuleSet);
    expect(activeUsageRuleSetForDraft(false, advancedRuleSet, draft))
      .toBeUndefined();
  });

  it("drops stale advanced rules after selecting a different expression template", () => {
    const draft = {
      name: "token-model",
      billingMode: "tiered_expr" as const,
      billingExpr: 'tier("tokens", p * 2 + c * 8)',
    };
    const activeRuleSet = activeUsageRuleSetForDraft(
      true,
      advancedRuleSet,
      draft,
    );
    const spec = runtimeDisplaySpec(draft, undefined, draft, activeRuleSet);

    expect(activeRuleSet).toBeUndefined();
    expect(spec.blocks?.[0]?.usageRuleSet).toBeUndefined();
    expect(spec.blocks?.[0]?.baseExpression).toBe(draft.billingExpr);
  });

  it("stores the new template without metadata from the previously saved template", () => {
    const templateA = {
      name: "tiered-model",
      billingMode: "tiered_expr" as const,
      billingExpr: 'tier("A", p * 1 + c * 2)',
    };
    const templateB = {
      ...templateA,
      billingExpr: 'tier("B", p * 3 + c * 4)',
    };

    const first = runtimeDisplaySpec(templateA, undefined, templateA);
    const second = runtimeDisplaySpec(templateB, undefined, templateB);

    expect(first.blocks?.[0]?.baseExpression).toContain('tier("A"');
    expect(second.blocks?.[0]?.baseExpression).toContain('tier("B"');
    expect(second.blocks?.[0]?.baseExpression).not.toContain('tier("A"');
    expect(second.blocks?.[0]?.usageRuleSet).toBeUndefined();
  });

  it("ignores advanced-rule metadata left behind by an older buggy save", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{
        baseExpression: 'tier("new template", p * 3 + c * 4)',
        usageRuleSet: advancedRuleSet,
      }],
    };

    expect(matchingUsageRuleSet(spec)).toBeUndefined();
  });

  it("keeps advanced-rule metadata when it still matches the saved expression", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{
        baseExpression: advancedExpression,
        usageRuleSet: advancedRuleSet,
      }],
    };

    expect(matchingUsageRuleSet(spec)).toBe(advancedRuleSet);
  });
});

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

  it("scales an output-image fixed price without changing its quantity multiplier", () => {
    const result = applyPricingDiscount(
      {
        name: "image-model",
        billingMode: "tiered_expr",
        billingExpr: 'tier("image", fixed(0.5)) * image_count',
      },
      10,
    );

    expect(result.billingExpr).toBe('tier("image", fixed(0.45)) * image_count');
    expect(result.billingExpr).not.toContain(") * image_count) * 0.9");
    expect(compileBillingExpression(result.billingExpr || "").status).toBe("ready");
  });

  it("scales fixed and token prices in separate conditional branches", () => {
    const result = applyPricingDiscount(
      {
        name: "hybrid-model",
        billingMode: "tiered_expr",
        billingExpr:
          'len < 1000 ? tier("request", fixed(0.01)) : tier("tokens", p * 2 + c * 8)',
      },
      10,
    );

    expect(result.billingExpr).toContain('fixed(0.009)');
    expect(result.billingExpr).toContain("p * 1.8");
    expect(result.billingExpr).toContain("c * 7.2");
    expect(compileBillingExpression(result.billingExpr || "").status).toBe("ready");
  });

  it("does not scale request quantities or request-rule multipliers", () => {
    const result = applyPricingDiscount(
      {
        name: "quality-image-model",
        billingMode: "tiered_expr",
        billingExpr:
          'tier("image", fixed(0.5)) * image_count * (param("quality") == "hd" ? 2 : 1)',
      },
      10,
    );

    expect(result.billingExpr).toBe(
      'tier("image", fixed(0.45)) * image_count * (param("quality") == "hd" ? 2 : 1)',
    );
    expect(compileBillingExpression(result.billingExpr || "").status).toBe("ready");
  });

  it("scales usage-meter prices", () => {
    const result = applyPricingDiscount(
      {
        name: "video-model",
        billingMode: "tiered_expr",
        billingExpr: 'tier("video", u("seconds") * 0.1)',
      },
      10,
    );

    expect(result.billingExpr).toBe('tier("video", u("seconds") * 0.09)');
    expect(compileBillingExpression(result.billingExpr || "").status).toBe("ready");
  });
});

describe("vendorEditorData", () => {
  it("uses a stored expression even when the legacy mode flag is stale", () => {
    const result = vendorEditorData("tiered-model", {
      mode: "token",
      blocks: [{
        input: 2,
        baseExpression: 'tier("0-128K", p * 2 + c * 8)',
      }],
    });

    expect(result?.billingMode).toBe("tiered_expr");
    expect(result?.billingExpr).toContain('tier("0-128K"');
  });

  it("prefers the saved base expression over normalized token fields", () => {
    const result = vendorEditorData("tiered-model", {
      mode: "expression",
      blocks: [{
        input: 2,
        note: 'tier("old", p * 1 + c * 2)',
        baseExpression: 'tier("new", p * 3 + c * 4)',
      }],
    });

    expect(result?.billingMode).toBe("tiered_expr");
    expect(result?.billingExpr).toContain('tier("new"');
  });
});

describe("vendorComparisonValue", () => {
  it("maps normalized display prices to expression editor variables", () => {
    const spec: PriceSpec = {
      mode: "token",
      blocks: [{ input: 2, output: 8, cache: 0.5, createCache: 0.25 }],
    };

    expect(vendorComparisonValue(spec, "p")).toBe(2);
    expect(vendorComparisonValue(spec, "c")).toBe(8);
    expect(vendorComparisonValue(spec, "cr")).toBe(0.5);
    expect(vendorComparisonValue(spec, "cc")).toBe(0.25);
  });

  it("reads normalized vendor prices from blocks after the first block", () => {
    const spec: PriceSpec = {
      mode: "token",
      blocks: [
        { label: "metadata only" },
        { label: "vendor token price", input: 1.25, output: 5 },
      ],
    };

    expect(vendorComparisonValue(spec, "p", "vendor token price")).toBe(1.25);
    expect(vendorComparisonValue(spec, "c", "vendor token price")).toBe(5);
  });

  it("reads baseExpression vendor prices, including shared input prices", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [
        {
          baseExpression:
            '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking output", c * 10.8) : tier("non-thinking output", c * 9.6))',
        },
      ],
    };

    expect(vendorComparisonValue(spec, "p")).toBe(1.8);
    expect(vendorComparisonValue(spec, "c", "thinking output")).toBe(10.8);
    expect(vendorComparisonValue(spec, "c", "non-thinking output")).toBe(9.6);
  });

  it("parses each expression block independently", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [
        { label: "input", baseExpression: 'tier("input", p * 1.8)' },
        { label: "output", baseExpression: 'tier("output", c * 9.6)' },
      ],
    };

    expect(vendorComparisonValue(spec, "p", "input")).toBe(1.8);
    expect(vendorComparisonValue(spec, "c", "output")).toBe(9.6);
  });

  it("uses a unique vendor price after a tier is renamed", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{ baseExpression: 'tier("old tier name", c * 9.6)' }],
    };

    expect(vendorComparisonValue(spec, "c", "new tier name")).toBe(9.6);
  });

  it("does not guess after a tier is renamed when vendor prices differ", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{
        baseExpression:
          'len <= 128000 ? tier("short", c * 9.6) : tier("long", c * 12.7)',
      }],
    };

    expect(vendorComparisonValue(spec, "c", "renamed tier")).toBeUndefined();
    expect(vendorComparisonValue(spec, "c", " short  ")).toBe(9.6);
  });

  it("resolves a comparison price for every visual expression preset", () => {
    for (const group of PLATFORM_BILLING_PRESET_GROUPS) {
      for (const preset of group.presets) {
        const spec: PriceSpec = {
          mode: "expression",
          blocks: [{ baseExpression: preset.expr }],
        };
        const document = parseVisualBillingDocument(preset.expr);
        expect(document, preset.key).not.toBeNull();
        const scopes = document ? visualTierLabels(document.root) : [];
        const values = [undefined, ...scopes].flatMap((scope) => [
          vendorComparisonValue(spec, "p", scope),
          vendorComparisonValue(spec, "c", scope),
          vendorComparisonValue(spec, "aud_s", scope),
          vendorComparisonValue(spec, "fixed", scope),
        ]);
        expect(values.some((value) => typeof value === "number"), preset.key)
          .toBe(true);
      }
    }
  });
});

describe("matchingUsageRuleSet", () => {
  it("finds valid advanced pricing metadata outside the first block", () => {
    const expression = 'tier("Default image", fixed(0.5)) * image_count';
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [
        { label: "metadata" },
        { baseExpression: expression, usageRuleSet: advancedRuleSet },
      ],
    };

    expect(matchingUsageRuleSet(spec)).toBe(advancedRuleSet);
  });
});
