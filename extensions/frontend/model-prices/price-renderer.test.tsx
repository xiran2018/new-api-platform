import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  PriceRenderer,
  expressionPriceBlocks,
  publicPriceBlockGroups,
  publicPriceRows,
} from "./price-renderer";
import { PLATFORM_BILLING_PRESET_GROUPS } from "./expression-presets";

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

  it("derives displayable prices for every platform expression preset", () => {
    for (const group of PLATFORM_BILLING_PRESET_GROUPS) {
      for (const preset of group.presets) {
        const blocks = expressionPriceBlocks(preset.expr);
        expect(blocks, preset.key).not.toBeNull();
        expect(blocks?.some((block) =>
          Object.entries(block).some(([key, value]) =>
            ["input", "output", "cache", "createCache", "createCache1h", "image", "imageOutput", "audioInput", "audioOutput", "audioDuration", "videoInput", "videoOutput", "multimodalOutput"].includes(key) &&
            typeof value === "number" && value !== 0,
          ),
        ), preset.key).toBe(true);
      }
    }
  });

  it("builds public table rows without raw expression conditions", () => {
    const blocks = expressionPriceBlocks(
      '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking", c * 10.8) : tier("non-thinking", c * 9.6))',
    );
    expect(blocks).toHaveLength(2);

    const rows = blocks?.flatMap((block) => publicPriceRows(block, false)) ?? [];
    expect(rows.map((row) => row.label)).toEqual([
      "Input price",
      "Output price",
      "Input price",
      "Output price",
    ]);
    expect(JSON.stringify(rows)).not.toContain("enable_thinking");
    expect(JSON.stringify(rows)).not.toContain("param(");
    expect(JSON.stringify(rows)).not.toContain("<=");
  });

  it("renders public expression pricing as tiered tables without raw expressions", () => {
    render(
      <PriceRenderer
        tableLayout
        timezone="Asia/Shanghai"
        spec={{
          mode: "expression",
          blocks: [
            {
              label: "Input length + thinking output",
              baseExpression:
                '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking", c * 10.8) : tier("non-thinking", c * 9.6))',
            },
          ],
        }}
      />,
    );

    expect(document.querySelectorAll("table")).toHaveLength(1);
    expect(screen.getByText("Token range")).toBeInTheDocument();
    expect(screen.getByText("Input price")).toBeInTheDocument();
    expect(screen.getByText("Output price")).toBeInTheDocument();
    expect(screen.getByText("Thinking mode")).toBeInTheDocument();
    expect(screen.getByText("Non-thinking mode")).toBeInTheDocument();
    expect(screen.getAllByText("Default tier")).toHaveLength(1);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.queryByText(/enable_thinking/)).not.toBeInTheDocument();
    expect(screen.queryByText(/param\(/)).not.toBeInTheDocument();
  });

  it("groups same input-length tiers and splits thinking output into columns", () => {
    const blocks = expressionPriceBlocks(
      'len <= 128000 ? (param("enable_thinking") == true ? tier("0-128K thinking", p * 0.8 + c * 4.8) : tier("0-128K non-thinking", p * 0.8 + c * 4)) : (param("enable_thinking") == true ? tier("128K-256K thinking", p * 2 + c * 12) : tier("128K-256K non-thinking", p * 2 + c * 8))',
    );
    expect(blocks).toHaveLength(4);

    const groups = publicPriceBlockGroups(blocks ?? []);
    expect(groups.map(({ label, blocks }) => ({ label, size: blocks.length }))).toEqual([
      { label: "0-128K", size: 2 },
      { label: "128K-256K", size: 2 },
    ]);
  });

  it("renders one row per token tier with a shared input column", () => {
    render(
      <PriceRenderer
        tableLayout
        timezone="Asia/Shanghai"
        spec={{
          mode: "expression",
          blocks: [
            { label: "0-128K thinking", input: 2, output: 8 },
            { label: "0-128K non-thinking", input: 2, output: 6 },
            { label: "128K-256K thinking", input: 4, output: 12 },
            { label: "128K-256K non-thinking", input: 4, output: 10 },
          ],
        }}
      />,
    );

    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getAllByText("0-128K")).toHaveLength(1);
    expect(screen.getAllByText("128K-256K")).toHaveLength(1);
  });
});
