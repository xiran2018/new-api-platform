export type PriceTable = { headers?: string[]; rows?: string[][] };
export type PriceBlock = {
  label?: string;
  note?: string;
  input?: number | null;
  output?: number | null;
  price?: number | null;
  unit?: string;
  start?: string;
  end?: string;
  min?: number | null;
  max?: number | null;
  discount?: number | null;
  table?: PriceTable;
};
export type PriceSpec = {
  mode?: "token" | "request" | "time" | "tiered" | "table" | "expression";
  blocks?: PriceBlock[];
};
export type ModelPrice = {
  id: number;
  modelKey: string;
  displayName: string;
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
