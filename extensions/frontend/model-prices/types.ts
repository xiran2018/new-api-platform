export type PriceTable = { headers?: string[]; rows?: string[][] };
export type UsageRuleCondition = {
  field: string;
  operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
  value: string | number | boolean;
};
export type UsagePriceCharge = {
  meter: string;
  unit: string;
  price: number;
  priceBasis?: "unit" | "million";
  divisor?: number;
};
export type UsagePriceRule = {
  id: string;
  label: string;
  conditions: UsageRuleCondition[];
  charges: UsagePriceCharge[];
};
export type UsageRuleSet = {
  version: 1;
  execution: "request" | "task";
  rules: UsagePriceRule[];
};
export type PriceBlock = {
  label?: string;
  note?: string;
  input?: number | null;
  output?: number | null;
  cache?: number | null;
  createCache?: number | null;
  image?: number | null;
  audioInput?: number | null;
  audioOutput?: number | null;
  price?: number | null;
  unit?: string;
  start?: string;
  end?: string;
  min?: number | null;
  max?: number | null;
  discount?: number | null;
  baseExpression?: string;
  usageRuleSet?: UsageRuleSet;
  table?: PriceTable;
};
export type PriceSpec = {
  mode?: "token" | "request" | "time" | "tiered" | "table" | "expression";
  pricingCurrency?: "USD" | "site";
  blocks?: PriceBlock[];
};
export type ModelPrice = {
  id: number;
  modelKey: string;
  displayName: string;
  description: string;
  vendor: string;
  tags: string[];
  currency: string;
  timezone: string;
  vendorPriceSpec: PriceSpec;
  llmapiPriceSpec: PriceSpec;
  pendingVendorSpec?: PriceSpec | null;
  runtimePricingRef?: Record<string, unknown>;
  upstreamSource?: string;
  syncStatus: string;
  published: boolean;
  sortOrder: number;
};
