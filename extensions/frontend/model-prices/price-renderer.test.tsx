import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime'

import { EXPRESSION_TEMPLATE_REGISTRY } from './billing-template-registry'
import { PLATFORM_BILLING_PRESET_GROUPS } from './expression-presets'
import {
  PriceRenderer,
  expressionPriceBlocks,
  publicPriceBlockGroups,
  publicPriceRowUnit,
  publicPriceRows,
} from './price-renderer'
import { usageRuleSetExpression } from './usage-rule-expression'
import type { UsageRuleSet } from './types'

describe('expression price display', () => {
  it('shows audio duration prices and differences with six decimals', () => {
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

    expect(screen.getByText('$0.000240')).toBeInTheDocument()
    expect(screen.getByText('+$0.000020')).toBeInTheDocument()
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

    expect(screen.getByText('$0.000220')).toBeInTheDocument()
    expect(screen.getByText('Audio duration:')).toBeInTheDocument()
    expect(screen.getByText('/ 秒')).toBeInTheDocument()
    expect(screen.queryByText('/ 1M tokens')).not.toBeInTheDocument()
  })

  it('keeps the speech-recognition per-second preset at six decimals', () => {
    const preset = PLATFORM_BILLING_PRESET_GROUPS
      .flatMap((group) => group.presets)
      .find((candidate) => candidate.key === 'audio-transcription-per-second')

    expect(preset).toBeDefined()
    const blocks = expressionPriceBlocks(preset!.expr, 1 / 1_000_000)
    expect(blocks?.[0]?.audioDuration).toBeCloseTo(0.00022, 12)

    render(
      <PriceRenderer
        tableLayout
        displayCurrency='USD'
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [{ audioDuration: blocks![0].audioDuration, unit: '秒' }],
        }}
      />
    )

    expect(screen.getByText('$0.000220')).toBeInTheDocument()
    expect(screen.getByText('/ 秒')).toBeInTheDocument()
  })

  it('uses seconds for audio-duration expression fields instead of token units', () => {
    expect(publicPriceRowUnit('audioDuration', '1M tokens')).toBe('秒')
    expect(publicPriceRowUnit('audioInput', '1M tokens')).toBe('1M tokens')
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
                  'imageCache',
                  'imageOutput',
                  'audioInput',
                  'audioCache',
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

  it('hides the tiered pricing mode label for a single visible tier', () => {
    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [{ label: '0-128K', input: 1, output: 2 }],
        }}
      />
    )

    expect(screen.queryByText(/Pricing mode/)).not.toBeInTheDocument()
    expect(screen.getByText('Input price')).toBeInTheDocument()
    expect(screen.getByText('Output price')).toBeInTheDocument()
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

  it('renders text/audio input and text/audio output pricing in one input-first row', () => {
    const preset = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
      (group) => group.presets,
    ).find((item) => item.key === 'text-audio-input-text-audio-output-simple')
    expect(preset).toBeDefined()

    const blocks = expressionPriceBlocks(preset?.expr || '')
    expect(blocks).toEqual([
      expect.objectContaining({
        label: 'text/audio input + text/audio output',
        input: 1,
        audioInput: 1,
        output: 1,
        audioOutput: 1,
      }),
    ])
    expect(
      evaluateBillingExpression(preset!.expr, {
        tokens: { p: 100, ai: 100, c: 100, ao: 100 },
      }),
    ).toMatchObject({
      status: 'success',
      cost: 400,
      matchedTier: 'text/audio input + text/audio output',
    })

    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{ mode: 'expression', blocks: [{ baseExpression: preset?.expr }] }}
      />,
    )

    expect(document.querySelectorAll('table')).toHaveLength(1)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.getByText('Text input price')).toBeInTheDocument()
    expect(screen.getByText('Audio input price')).toBeInTheDocument()
    expect(screen.getByText('Text output price')).toBeInTheDocument()
    expect(screen.getByText('Audio output price')).toBeInTheDocument()
    expect(screen.getByText('Input unit price')).toBeInTheDocument()
    expect(screen.getByText('Output unit price')).toBeInTheDocument()
  })

  it.each([
    {
      key: 'audio-input-audio-output-token-pricing',
      outputField: 'audioOutput' as const,
      outputLabel: 'Audio output price',
      tokens: { ai: 100, ao: 40 },
      expectedCost: 100 * 3.5 + 40 * 21,
      matchedTier: 'audio input + audio output token pricing',
    },
    {
      key: 'audio-input-text-output-token-pricing',
      outputField: 'output' as const,
      outputLabel: 'Text output price',
      tokens: { ai: 100, c: 40 },
      expectedCost: 100 * 3.5 + 40 * 21,
      matchedTier: 'audio input + text output token pricing',
    },
  ])(
    'renders $key as one administrator-friendly input/output row',
    ({ key, outputField, outputLabel, tokens, expectedCost, matchedTier }) => {
      const preset = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
        (group) => group.presets,
      ).find((item) => item.key === key)
      expect(preset).toBeDefined()

      const blocks = expressionPriceBlocks(preset?.expr || '')
      expect(blocks).toEqual([
        expect.objectContaining({
          label: matchedTier,
          audioInput: 3.5,
          [outputField]: 21,
          unit: '1M tokens',
        }),
      ])
      expect(
        evaluateBillingExpression(preset!.expr, { tokens }),
      ).toMatchObject({
        status: 'success',
        cost: expectedCost,
        matchedTier,
      })

      const { container } = render(
        <PriceRenderer
          tableLayout
          timezone='Asia/Shanghai'
          spec={{ mode: 'expression', blocks: [{ baseExpression: preset?.expr }] }}
        />,
      )

      expect(container.querySelectorAll('table')).toHaveLength(1)
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
      expect(screen.getByText('Audio input price')).toBeInTheDocument()
      expect(screen.getByText(outputLabel)).toBeInTheDocument()
      expect(screen.getByText('Input unit price')).toBeInTheDocument()
      expect(screen.getByText('Output unit price')).toBeInTheDocument()
      expect(screen.queryByText('Image input price')).not.toBeInTheDocument()
    },
  )

  it('renders cached input prices for text image and audio Realtime modalities', () => {
    const preset = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
      (group) => group.presets,
    ).find((item) => item.key === 'realtime-modality-cache-pricing')
    expect(preset).toBeDefined()

    const blocks = expressionPriceBlocks(preset?.expr || '')
    expect(blocks).toEqual([
      expect.objectContaining({
        input: 1,
        cache: 0.5,
        output: 1,
        image: 1,
        imageCache: 0.5,
        imageOutput: 1,
        audioInput: 1,
        audioCache: 0.5,
        audioOutput: 1,
      }),
    ])

    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{ mode: 'expression', blocks: [{ baseExpression: preset?.expr }] }}
      />,
    )
    expect(screen.getByText('Cache read price')).toBeInTheDocument()
    expect(screen.getByText('Image cache input price')).toBeInTheDocument()
    expect(screen.getByText('Audio cache input price')).toBeInTheDocument()
  })

  it('renders audio/image input and text/audio output pricing in one input-first row', () => {
    const preset = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
      (group) => group.presets,
    ).find((item) => item.key === 'audio-image-input-text-audio-output')
    expect(preset).toBeDefined()

    const blocks = expressionPriceBlocks(preset?.expr || '')
    expect(blocks).toEqual([
      expect.objectContaining({
        label: 'audio/image input + text/audio output',
        audioInput: 1,
        image: 1,
        output: 1,
        audioOutput: 1,
      }),
    ])
    expect(
      evaluateBillingExpression(preset!.expr, {
        tokens: { ai: 100, img: 100, c: 100, ao: 100 },
      }),
    ).toMatchObject({
      status: 'success',
      cost: 400,
      matchedTier: 'audio/image input + text/audio output',
    })

    render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{ mode: 'expression', blocks: [{ baseExpression: preset?.expr }] }}
      />,
    )

    expect(document.querySelectorAll('table')).toHaveLength(1)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.getByText('Audio input price')).toBeInTheDocument()
    expect(screen.getByText('Image input price')).toBeInTheDocument()
    expect(screen.getByText('Text output price')).toBeInTheDocument()
    expect(screen.getByText('Audio output price')).toBeInTheDocument()
    expect(screen.getByText('Input unit price')).toBeInTheDocument()
    expect(screen.getByText('Output unit price')).toBeInTheDocument()
  })

  it('renders Gemini easy templates with modality-specific horizontal headers', () => {
    render(
      <PriceRenderer
        tableLayout
        displayCurrency='USD'
        timezone='Asia/Shanghai'
        spec={{
          mode: 'expression',
          blocks: [
            { label: 'Gemini Flash Lite easy unified input/output', input: 1, cache: 0.1, output: 2, unit: '1M tokens' },
            { label: 'Gemini Flash Lite easy audio split', input: 1, audioInput: 2, cache: 0.1, createCache: 9.9, audioCache: 0.2, output: 3, unit: '1M tokens' },
          ],
        }}
      />,
    )
    expect(screen.getByText('Text/image/video input')).toBeInTheDocument()
    expect(screen.getByText('Audio cached input')).toBeInTheDocument()
    expect(screen.queryByText('Unified input')).not.toBeInTheDocument()
    expect(screen.queryByText('Cache write price')).not.toBeInTheDocument()
    expect(screen.queryByText('Gemini Flash Lite easy pricing')).not.toBeInTheDocument()
    expect(screen.getByText('$0.200')).toBeInTheDocument()
    expect(screen.queryByText('$9.900')).not.toBeInTheDocument()
    const unified = render(
      <PriceRenderer
        tableLayout
        timezone='Asia/Shanghai'
        spec={{ mode: 'expression', blocks: [{ label: 'Gemini Flash Lite easy unified input/output', input: 1, cache: 0.1, output: 2, unit: '1M tokens' }] }}
      />,
    )
    expect(screen.getByText('Text/image/video/audio input')).toBeInTheDocument()
    unified.unmount()
  })

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
