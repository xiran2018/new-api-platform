import {
  combineBillingExpr,
  splitBillingExprAndRequestRules,
} from "@/features/pricing/lib/billing-expr";

export type BillingExpressionDraft = {
  source: string;
  billingExpr: string;
  requestRuleExpr: string;
};

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
