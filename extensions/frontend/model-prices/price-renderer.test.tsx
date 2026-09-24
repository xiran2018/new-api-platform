import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EXPRESSION_TEMPLATE_REGISTRY } from './billing-template-registry'
import { PLATFORM_BILLING_PRESET_GROUPS } from './expression-presets'
import {
  PriceRenderer,
  expressionPriceBlocks,
  publicPriceBlockGroups,
  publicPriceRows,
} from './price-renderer'
import { usageRuleSetExpression } from './usage-rule-expression'
import type { UsageRuleSet } from './types'

describe('expression price display', () => {
  it('shows audio duration prices and differences with up to six decimals', () => {
    render(
      <PriceRenderer
        tableLayout
        showMarkup
        displayCurrency='USD'
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [{ audioDuration: 0.00024, unit: '秒' }],
        }}
        compareSpec={{
          mode: 'expression',
          blocks: [{ audioDuration: 0.00022, unit: '秒' }],
        }}
      />
    )

    expect(screen.getByText('$0.00024')).toBeInTheDocument()
    expect(screen.getByText('+$0.00002')).toBeInTheDocument()
  })

  it('shows advanced audio duration rules with six-decimal precision', () => {
    const ruleSet: UsageRuleSet = {
      version: 1,
      execution: 'request',
      rules: [
        {
          id: 'audio-duration',
          label: 'Audio duration',
          conditions: [],
          charges: [{ meter: 'seconds', unit: '秒', price: 0.00022 }],
        },
      ],
    }

    render(
      <PriceRenderer
        displayCurrency='USD'
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [
            {
              baseExpression: usageRuleSetExpression(ruleSet),
              usageRuleSet: ruleSet,
            },
          ],
        }}
      />
    )

    expect(screen.getByText('$0.00022')).toBeInTheDocument()
  })

  it('keeps every expression preset registered with its full compatibility contract', () => {
    const presets = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
      (group) => group.presets
    )
    expect(presets.map(({ key }) => key)).toEqual(
      EXPRESSION_TEMPLATE_REGISTRY.map(({ key }) => key)
    )

    for (const contract of EXPRESSION_TEMPLATE_REGISTRY) {
      const preset = presets.find(({ key }) => key === contract.key)
      expect(preset?.label, contract.key).toBe(contract.name)
      expect(contract.purpose, contract.key).not.toBe('')
      expect(contract.priceFields.length, contract.key).toBeGreaterThan(0)
      expect(contract.unit, contract.key).not.toBe('')
      expect(contract.layout.editor, contract.key).not.toBe('')
      expect(contract.layout.managementDisplay, contract.key).not.toBe('')
      expect(contract.layout.publicDisplay, contract.key).not.toBe('')
      expect(contract.runtime, contract.key).not.toBe('')
      expect(contract.compatibility, contract.key).not.toBe('')
    }
  })

  it('derives visible blocks from request-body thinking branches', () => {
    const blocks = expressionPriceBlocks(
      '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking", c * 10.8) : tier("non-thinking", c * 9.6))'
    )
    expect(blocks).toHaveLength(2)
    expect(
      blocks?.map(({ label, input, output }) => ({ label, input, output }))
    ).toEqual([
      { label: 'thinking', input: 1.8, output: 10.8 },
      { label: 'non-thinking', input: 1.8, output: 9.6 },
    ])
  })

  it('derives displayable prices for every platform expression preset', () => {
    for (const group of PLATFORM_BILLING_PRESET_GROUPS) {
      for (const preset of group.presets) {
        const blocks = expressionPriceBlocks(preset.expr)
        expect(blocks, preset.key).not.toBeNull()
        expect(
          blocks?.some((block) =>
            Object.entries(block).some(
              ([key, value]) =>
                [
                  'input',
                  'output',
                  'cache',
                  'createCache',
                  'createCache1h',
                  'image',
                  'imageOutput',
                  'audioInput',
                  'audioOutput',
                  'audioDuration',
                  'videoInput',
                  'videoOutput',
                  'multimodalOutput',
                ].includes(key) &&
                typeof value === 'number' &&
                value !== 0
            )
          ),
          preset.key
        ).toBe(true)
      }
    }
  })

  it('builds public table rows without raw expression conditions', () => {
    const blocks = expressionPriceBlocks(
      '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking", c * 10.8) : tier("non-thinking", c * 9.6))'
    )
    expect(blocks).toHaveLength(2)

    const rows = blocks?.flatMap((block) => publicPriceRows(block, false)) ?? []
    expect(rows.map((row) => row.label)).toEqual([
      'Input price',
      'Output price',
      'Input price',
      'Output price',
    ])
    expect(JSON.stringify(rows)).not.toContain('enable_thinking')
    expect(JSON.stringify(rows)).not.toContain('param(')
    expect(JSON.stringify(rows)).not.toContain('<=')
  })

  it('renders public expression pricing as tiered tables without raw expressions', () => {
    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{
          blocks: [
            {
              label: 'Input length + thinking output',
              note:
                '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking", c * 10.8) : tier("non-thinking", c * 9.6))',
            },
          ],
        }}
      />
    )

    expect(document.querySelectorAll('table')).toHaveLength(1)
    expect(screen.getByText('Token range')).toBeInTheDocument()
    expect(screen.getByText('Input price')).toBeInTheDocument()
    expect(screen.getByText('Output price')).toBeInTheDocument()
    expect(screen.getByText('Thinking mode')).toBeInTheDocument()
    expect(screen.getByText('Non-thinking mode')).toBeInTheDocument()
    expect(screen.getAllByText('Default tier')).toHaveLength(1)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.queryByText(/enable_thinking/)).not.toBeInTheDocument()
    expect(screen.queryByText(/param\(/)).not.toBeInTheDocument()
  })

  it('groups same input-length tiers and splits thinking output into columns', () => {
    const blocks = expressionPriceBlocks(
      'len <= 128000 ? (param("enable_thinking") == true ? tier("0-128K thinking", p * 0.8 + c * 4.8) : tier("0-128K non-thinking", p * 0.8 + c * 4)) : (param("enable_thinking") == true ? tier("128K-256K thinking", p * 2 + c * 12) : tier("128K-256K non-thinking", p * 2 + c * 8))'
    )
    expect(blocks).toHaveLength(4)

    const groups = publicPriceBlockGroups(blocks ?? [])
    expect(
      groups.map(({ label, blocks }) => ({ label, size: blocks.length }))
    ).toEqual([
      { label: '0-128K', size: 2 },
      { label: '128K-256K', size: 2 },
    ])
  })

  it('keeps legacy input-range thinking prices paired after the preset is removed', () => {
    const legacyExpression =
      'len <= 256000 ? (param("enable_thinking") == true ? tier("0-256K thinking", p * 2 + c * 12) : tier("0-256K", p * 2 + c * 8)) : (param("enable_thinking") == true ? tier("256K+ thinking", p * 6 + c * 24) : tier("256K+", p * 6 + c * 16))'
    const blocks = expressionPriceBlocks(legacyExpression)
    expect(blocks).toHaveLength(4)
    expect(
      publicPriceBlockGroups(blocks ?? []).map(
        ({ label, blocks: grouped }) => ({
          label,
          size: grouped.length,
        })
      )
    ).toEqual([
      { label: '0-256K', size: 2 },
      { label: '256K+', size: 2 },
    ])
  })

  it('keeps one input price and separate thinking outputs in every shared-input range', () => {
    const preset = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
      (group) => group.presets
    ).find((item) => item.key === 'three-range-shared-input-thinking-output')
    expect(preset).toBeDefined()
    const blocks = expressionPriceBlocks(preset?.expr || '')
    expect(blocks).toHaveLength(8)

    const groups = publicPriceBlockGroups(blocks ?? [])
    expect(groups).toHaveLength(4)
    expect(
      groups.map((group) => ({
        label: group.label,
        input: group.thinkingBlock?.input,
        nonThinkingInput: group.nonThinkingBlock?.input,
        thinkingOutput: group.thinkingBlock?.output,
        nonThinkingOutput: group.nonThinkingBlock?.output,
      }))
    ).toEqual([
      {
        label: '0-128K',
        input: 0.8,
        nonThinkingInput: 0.8,
        thinkingOutput: 4.8,
        nonThinkingOutput: 3.6,
      },
      {
        label: '128K-256K',
        input: 2,
        nonThinkingInput: 2,
        thinkingOutput: 12,
        nonThinkingOutput: 9,
      },
      {
        label: '256K-1M',
        input: 4,
        nonThinkingInput: 4,
        thinkingOutput: 24,
        nonThinkingOutput: 18,
      },
      {
        label: '1M+',
        input: 4,
        nonThinkingInput: 4,
        thinkingOutput: 24,
        nonThinkingOutput: 18,
      },
    ])
  })

  it('renders one row per token tier with a shared input column', () => {
    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [
            { label: '0-128K thinking', input: 2, output: 8 },
            { label: '0-128K non-thinking', input: 2, output: 6 },
            { label: '128K-256K thinking', input: 4, output: 12 },
            { label: '128K-256K non-thinking', input: 4, output: 10 },
          ],
        }}
      />
    )

    expect(document.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(screen.getAllByText('0-128K')).toHaveLength(1)
    expect(screen.getAllByText('128K-256K')).toHaveLength(1)
  })

  it.each(['omni-output-modes', 'omni-shared-media-input-output-modes'])(
    'renders %s as one grouped input/output row',
    (presetKey) => {
      const preset = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
        (group) => group.presets
      ).find((item) => item.key === presetKey)
      expect(preset).toBeDefined()

      render(
        <PriceRenderer
          tableLayout
          timezone='Asia/Shanghai'
          spec={{
            mode: 'expression',
            blocks: [{ baseExpression: preset?.expr }],
          }}
        />
      )

      expect(document.querySelectorAll('table')).toHaveLength(1)
      expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
      expect(screen.getByText('Input unit price')).toBeInTheDocument()
      expect(screen.getByText('Output unit price')).toBeInTheDocument()
      expect(screen.getByText('Image / video input')).toBeInTheDocument()
      expect(screen.getByText('Pure text output')).toBeInTheDocument()
      expect(screen.getByText('Multimodal text output')).toBeInTheDocument()
      expect(screen.queryByText(/img > 0/)).not.toBeInTheDocument()
      expect(screen.queryByText(/ao > 0/)).not.toBeInTheDocument()
    }
  )

  it('keeps different legacy image and video prices in one Omni table cell', () => {
    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [
            {
              label: 'pure text output',
              input: 1,
              image: 2,
              videoInput: 3,
              output: 4,
              unit: '1M tokens',
            },
            {
              label: 'multimodal text output',
              input: 1,
              image: 2,
              videoInput: 3,
              output: 5,
              unit: '1M tokens',
            },
            {
              label: 'text+audio output (audio only)',
              input: 1,
              image: 2,
              videoInput: 3,
              audioOutput: 6,
              unit: '1M tokens',
            },
          ],
        }}
      />
    )

    expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.getByText('Image input:')).toBeInTheDocument()
    expect(screen.getByText('Video input:')).toBeInTheDocument()
  })
})
