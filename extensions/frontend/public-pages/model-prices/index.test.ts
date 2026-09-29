import { describe, expect, it } from "vitest";

import { MODEL_PRICE_PRINT_STYLES } from "./index";

describe("model price PDF print layout", () => {
  it("prints all five columns on an unclipped A4 landscape page", () => {
    expect(MODEL_PRICE_PRINT_STYLES).toContain("size: A4 landscape")
    expect(MODEL_PRICE_PRINT_STYLES).toContain("#root .overflow-x-clip")
    expect(MODEL_PRICE_PRINT_STYLES).toContain("#root .overflow-x-hidden")
    expect(MODEL_PRICE_PRINT_STYLES).toMatch(
      /\.model-price-print-table\s*\{[^}]*min-width:\s*0\s*!important/s,
    )
    expect(MODEL_PRICE_PRINT_STYLES).toMatch(
      /> colgroup > col:nth-child\(4\) \{ width: 32% !important; \}/,
    )
    expect(MODEL_PRICE_PRINT_STYLES).toMatch(
      /> colgroup > col:nth-child\(5\) \{ width: 32% !important; \}/,
    )
    expect(MODEL_PRICE_PRINT_STYLES).toMatch(
      /\.model-price-print-table-wrap\s*\{[^}]*overflow:\s*visible\s*!important/s,
    )
    expect(MODEL_PRICE_PRINT_STYLES).toContain("display: table-header-group !important")
  })
})
