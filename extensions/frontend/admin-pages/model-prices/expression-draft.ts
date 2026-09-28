import {
  combineBillingExpr,
  splitBillingExprAndRequestRules,
} from "@/features/pricing/lib/billing-expr";

export type BillingExpressionDraft = {
  source: string;
  billingExpr: string;
  requestRuleExpr: string;
};

// A preset can update billingExpr and requestRuleExpr back-to-back in the
// same event. Keep one mutable draft for both callbacks; using a value from a
// render closure would let the second callback overwrite the first update
// with an empty or stale expression.
export function createBillingExpressionDraft(
  source: string,
): BillingExpressionDraft {
  return {
    source,
    ...splitBillingExprAndRequestRules(source),
  };
}

export function updateBillingExpressionDraft(
  draft: BillingExpressionDraft,
  field: "billingExpr" | "requestRuleExpr",
  value: string,
) {
  draft[field] = value;
  draft.source = combineBillingExpr(
    draft.billingExpr,
    draft.requestRuleExpr,
  );
  return draft.source;
}
