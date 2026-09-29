import { describe, expect, it } from "vitest";

import {
  activeUsageRuleSetForDraft,
  applyPricingDiscount,
  resolveVendorPriceSync,
  runtimeDisplaySpec,
  vendorComparisonSpec,
  vendorComparisonValue,
  vendorEditorData,
  vendorEditorDataForCurrentDraft,
} from "./runtime-pricing-editor";
import type { PriceSpec, UsageRuleSet } from "../../model-prices/types";

import { PLATFORM_BILLING_PRESET_GROUPS } from "@/platform/model-prices/expression-presets";
import { compileBillingExpression } from "@/features/pricing/lib/billing-expression/parser";
import { pricingFromDraft } from "@/features/model-pricing/pricing";
import {
  parseVisualBillingDocument,
  type VisualPricingNode,
} from "@/features/pricing/lib/billing-expression/visual";
import {
  matchingUsageRuleSet,
  usageRuleSetExpression,
} from "../../model-prices/usage-rule-expression";

function visualTierLabels(node: VisualPricingNode): string[] {
  return node.kind === "tier"
    ? [node.label]
    : [...visualTierLabels(node.yes), ...visualTierLabels(node.no)];
}

function visualPriceFields(
  node: VisualPricingNode,
  prefix = "",
): Array<{ key: string; scope: string; scopeId: string }> {
  const rules: VisualPricingNode[] = [];
  let current = node;
  while (current.kind === "branch") {
    rules.push(current);
    current = current.no;
  }
  rules.push(current);
  return rules.flatMap((rule, index) => {
    const scopeId = `${prefix}${index + 1}`;
    const tier = rule.kind === "tier" ? rule : rule.yes;
    if (tier.kind === "branch") {
      return visualPriceFields(tier, `${scopeId}.`);
    }
    return [
      ...(tier.billingUnit === "request"
        ? [{ key: "fixed", scope: tier.label, scopeId }]
        : []),
      ...(tier.sharedPrices || []).map((price) => ({
        key: price.variable,
        scope: tier.label,
        scopeId,
      })),
      ...tier.prices.map((price) => ({
        key: price.variable,
        scope: tier.label,
        scopeId,
      })),
    ];
  });
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

const videoRuleSet: UsageRuleSet = {
  version: 1,
  execution: "task",
  rules: [
    {
      id: "720p",
      label: "720P",
      conditions: [{ field: "resolution", operator: "eq", value: "720P" }],
      charges: [{ meter: "seconds", unit: "秒", price: 0.04, divisor: 1 }],
    },
    {
      id: "default-video",
      label: "其他视频分辨率",
      conditions: [],
      charges: [{ meter: "seconds", unit: "分钟", price: 3.6, divisor: 60 }],
    },
  ],
};

describe("pricing mode metadata", () => {
  const advancedExpression =
    'tier("Default image", fixed(0.5)) * image_count';

  it("keeps the shared pricing currency in the saved runtime display spec", () => {
    const draft = {
      name: "currency-model",
      billingMode: "tiered_expr" as const,
      billingExpr: 'tier("base", p * 1 + c * 2)',
    };

    expect(
      runtimeDisplaySpec(draft, undefined, draft, undefined, "site")
        .pricingCurrency,
    ).toBe("site");
  });

  it.each([
    [
      "audio input and audio output",
      `tier("audio input + audio output token pricing", ai * 3.5 + ao * 21)`,
    ],
    [
      "audio input and text output",
      `tier("audio input + text output token pricing", ai * 3.5 + c * 21)`,
    ],
  ])("persists the %s template as active runtime expression pricing", (_label, billingExpr) => {
    const draft = {
      name: "audio-model",
      billingMode: "tiered_expr" as const,
      billingExpr,
      requestRuleExpr: "",
    };

    const pricing = pricingFromDraft(draft);
    const display = runtimeDisplaySpec(draft, undefined, draft);

    expect(pricing["billing_setting.billing_mode"]).toBe("tiered_expr");
    expect(pricing["billing_setting.billing_expr"]).toBe(billingExpr);
    expect(display.mode).toBe("expression");
    expect(display.blocks?.[0]?.baseExpression).toBe(billingExpr);
    expect(compileBillingExpression(billingExpr).status).toBe("ready");
  });

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

describe("vendorEditorDataForCurrentDraft", () => {
  it.each([
    [
      "audio input and audio output",
      'tier("audio input + audio output token pricing", ai * 3.5 + ao * 21)',
    ],
    [
      "audio input and text output",
      'tier("audio input + text output token pricing", ai * 3.5 + c * 21)',
    ],
  ])("synchronizes a saved %s vendor expression without changing templates", (_label, billingExpr) => {
    const result = vendorEditorDataForCurrentDraft(
      "audio-model",
      {
        mode: "expression",
        pricingCurrency: "USD",
        blocks: [{
          label: "Expression",
          note: billingExpr,
          baseExpression: billingExpr,
        }],
      },
      {
        name: "audio-model",
        billingMode: "tiered_expr",
        billingExpr,
      },
    );

    expect(result?.billingMode).toBe("tiered_expr");
    expect(result?.billingExpr).toBe(billingExpr);
  });

  it("synchronizes structured audio-input/audio-output prices into the current expression template", () => {
    const result = vendorEditorDataForCurrentDraft(
      "gemini-live",
      {
        mode: "expression",
        pricingCurrency: "USD",
        blocks: [{ audioInput: 3.5, audioOutput: 21, unit: "1M tokens" }],
      },
      {
        name: "gemini-live",
        billingMode: "tiered_expr",
        billingExpr:
          'tier("audio input + audio output token pricing", ai * 1 + ao * 1)',
      },
    );

    expect(result?.billingMode).toBe("tiered_expr");
    expect(result?.billingExpr).toContain("ai * 3.5");
    expect(result?.billingExpr).toContain("ao * 21");
  });

  it("synchronizes structured audio-input/text-output prices into the current expression template", () => {
    const result = vendorEditorDataForCurrentDraft(
      "audio-text-model",
      {
        mode: "expression",
        blocks: [{ audioInput: 2, output: 12, unit: "1M tokens" }],
      },
      {
        name: "audio-text-model",
        billingMode: "tiered_expr",
        billingExpr:
          'tier("audio input + text output token pricing", ai * 1 + c * 1)',
      },
    );

    expect(result?.billingMode).toBe("tiered_expr");
    expect(result?.billingExpr).toContain("ai * 2");
    expect(result?.billingExpr).toContain("c * 12");
  });

  it("does not partially synchronize a current template with missing vendor fields", () => {
    const result = vendorEditorDataForCurrentDraft(
      "incomplete-audio-model",
      {
        mode: "expression",
        blocks: [{ audioInput: 2, unit: "1M tokens" }],
      },
      {
        name: "incomplete-audio-model",
        billingMode: "tiered_expr",
        billingExpr:
          'tier("audio input + audio output token pricing", ai * 1 + ao * 1)',
      },
    );

    expect(result).toBeNull();
  });
});

describe("resolveVendorPriceSync", () => {
  it("keeps an output-video usage rule as advanced pricing and copies all rule data", () => {
    const expression = usageRuleSetExpression(videoRuleSet);
    const vendorSpec: PriceSpec = {
      mode: "expression",
      pricingCurrency: "USD",
      blocks: [{
        label: "Expression",
        note: expression,
        baseExpression: expression,
        usageRuleSet: videoRuleSet,
      }],
    };

    const result = resolveVendorPriceSync(
      "video-model",
      vendorSpec,
      {
        name: "video-model",
        billingMode: "tiered_expr",
        billingExpr: 'tier("old expression", p * 1 + c * 2)',
      },
      "task",
    );

    expect(result?.usageRuleSet).toEqual(videoRuleSet);
    expect(result?.usageRuleSet).not.toBe(videoRuleSet);
    expect(result?.usageRuleSet?.rules[0]).not.toBe(videoRuleSet.rules[0]);
    expect(result?.usageRuleSet?.rules[0].conditions[0]).not.toBe(
      videoRuleSet.rules[0].conditions[0],
    );
    expect(result?.usageRuleSet?.rules[0].charges[0]).not.toBe(
      videoRuleSet.rules[0].charges[0],
    );
    expect(result?.usageRuleSet?.rules[0].conditions[0]).toEqual({
      field: "resolution",
      operator: "eq",
      value: "720P",
    });
    expect(result?.usageRuleSet?.rules[1].charges[0]).toEqual({
      meter: "seconds",
      unit: "分钟",
      price: 3.6,
      divisor: 60,
    });
    expect(result?.draft.billingMode).toBe("tiered_expr");
    expect(result?.draft.billingExpr).toBe(expression);
  });
});

describe("vendorComparisonValue", () => {
  it("treats a source URL note as metadata and falls back to structured prices", () => {
    const spec: PriceSpec = {
      mode: "token",
      blocks: [{
        note: "https://models.dev/api.json",
        input: 0.89,
        output: 4.81,
        cache: 0.5,
      }],
    };

    expect(vendorComparisonValue(spec, "p")).toBe(0.89);
    expect(vendorComparisonValue(spec, "c")).toBe(4.81);
    expect(vendorComparisonValue(spec, "cr")).toBe(0.5);
  });

  it("continues to read a valid billing expression stored in note", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{ note: 'tier("base", p * 1.25 + c * 5)' }],
    };

    expect(vendorComparisonValue(spec, "p", "base", "1")).toBe(1.25);
    expect(vendorComparisonValue(spec, "c", "base", "1")).toBe(5);
  });

  it("does not concatenate independent expression blocks", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [
        { baseExpression: 'tier("input", p * 1.25)' },
        { baseExpression: 'tier("output", c * 5)' },
      ],
    };

    expect(vendorComparisonValue(spec, "p", "input")).toBe(1.25);
    expect(vendorComparisonValue(spec, "c", "output")).toBe(5);
  });

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

  it("uses the stable visual rule path when tier names are duplicated", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{
        baseExpression:
          'len <= 128000 ? tier("same tier", c * 9.6) : tier("same tier", c * 12.7)',
      }],
    };

    expect(vendorComparisonValue(spec, "c", "same tier")).toBeUndefined();
    expect(vendorComparisonValue(spec, "c", "same tier", "1")).toBe(9.6);
    expect(vendorComparisonValue(spec, "c", "same tier", "2")).toBe(12.7);
  });

  it("does not let a stale visual rule path override the matching tier name", () => {
    const spec: PriceSpec = {
      mode: "expression",
      blocks: [{
        baseExpression:
          'len <= 128000 ? tier("short", c * 9.6) : tier("long", c * 12.7)',
      }],
    };

    expect(vendorComparisonValue(spec, "c", "long", "1")).toBe(12.7);
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
          vendorComparisonValue(spec, "ai", scope),
          vendorComparisonValue(spec, "ao", scope),
          vendorComparisonValue(spec, "aud_s", scope),
          vendorComparisonValue(spec, "fixed", scope),
        ]);
        expect(values.some((value) => typeof value === "number"), preset.key)
          .toBe(true);
      }
    }
  });

  it("resolves the vendor price beside every field loaded by vendor sync", () => {
    for (const group of PLATFORM_BILLING_PRESET_GROUPS) {
      for (const preset of group.presets) {
        const spec: PriceSpec = {
          mode: "expression",
          blocks: [{ baseExpression: preset.expr }],
        };
        const document = parseVisualBillingDocument(preset.expr);
        expect(document, preset.key).not.toBeNull();
        if (!document) continue;
        const fields = [
          ...(document.shared?.prices || []).map((price) => ({
            key: price.variable,
            scope: "Shared input pricing",
            scopeId: "shared",
          })),
          ...visualPriceFields(document.root),
        ];
        expect(fields.length, preset.key).toBeGreaterThan(0);
        for (const field of fields) {
          expect(
            vendorComparisonValue(spec, field.key, field.scope, field.scopeId),
            `${preset.key}: ${field.scopeId}/${field.scope}/${field.key}`,
          ).toBeTypeOf("number");
        }
      }
    }
  });
});

describe("vendorComparisonSpec", () => {
  it("normalizes a note-only expression into the same comparison baseline loaded by sync", () => {
    const source: PriceSpec = {
      mode: "expression",
      pricingCurrency: "USD",
      blocks: [{ note: 'tier("base", p * 1.25 + c * 5)' }],
    };
    const normalized = vendorComparisonSpec("note-expression", source);

    expect(normalized?.pricingCurrency).toBe("USD");
    expect(vendorComparisonValue(normalized, "p", "base", "1")).toBe(1.25);
    expect(vendorComparisonValue(normalized, "c", "base", "1")).toBe(5);
  });

  it("normalizes legacy token prices into a baseline that expression addons can compare", () => {
    const source: PriceSpec = {
      mode: "token",
      blocks: [{
        note: "https://models.dev/api.json",
        input: 0.89,
        output: 4.81,
        cache: 0.5,
      }],
    };
    const normalized = vendorComparisonSpec("legacy-token", source);

    expect(vendorComparisonValue(normalized, "p")).toBe(0.89);
    expect(vendorComparisonValue(normalized, "c")).toBe(4.81);
    expect(vendorComparisonValue(normalized, "cr")).toBe(0.5);
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
