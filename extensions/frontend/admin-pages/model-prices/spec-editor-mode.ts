import type { PriceSpec } from "../../model-prices/types";

export type SpecEditorMode = "token" | "request" | "expression" | "media";

/**
 * Advanced media pricing is persisted as a billing expression plus the
 * visual usage-rule metadata needed to edit it again. Prefer that metadata
 * over the outer expression mode when reopening the editor.
 */
export function specEditorMode(value: PriceSpec): SpecEditorMode {
  if (value.blocks?.some((block) => block.usageRuleSet?.rules?.length)) {
    return "media";
  }
  if (value.mode === "token" || value.mode === "request") return value.mode;
  return "expression";
}
