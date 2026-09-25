import { describe, expect, it } from 'vitest'

import { compileBillingExpression } from '@/features/pricing/lib/billing-expression/parser'
import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime'
import { BILLING_CAPABILITY_CONTRACT } from '@/platform/model-prices/billing-capability-contract'
import { ADVANCED_MEDIA_TEMPLATE_REGISTRY } from '@/platform/model-prices/billing-template-registry'
import { PLATFORM_BILLING_PRESET_GROUPS } from '@/platform/model-prices/expression-presets'

import {
  BILLING_TEMPLATE_KEYS,
  createUsageRuleTemplate,
  findComparisonUsageCharge,
  syncExampleTierNames,
  usageRuleSetExpression,
  usageFieldLabel,
  validateUsageRuleSet,
} from './usage-rule-builder'
import type {
  UsagePriceCharge,
  UsagePriceRule,
  UsageRuleSet,
} from '../../model-prices/types'

describe('vendor usage-rule comparison', () => {
  const outputCharge: UsagePriceCharge = {
    meter: 'seconds',
    unit: '秒',
    price: 0.12,
  }
  const actualRule: UsagePriceRule = {
    id: 'actual-hd',
    label: 'HD output',
    conditions: [{ field: 'resolution', operator: 'eq', value: '1080P' }],
    charges: [outputCharge],
  }

  it('matches the vendor tier by semantics after rules are reordered', () => {
    const vendor: UsageRuleSet = {
      version: 1,
      execution: 'request',
      rules: [
        {
          id: 'fallback',
          label: 'Fallback',
          conditions: [],
          charges: [{ meter: 'seconds', unit: '秒', price: 0.2 }],
        },
        {
          id: 'vendor-hd',
          label: 'HD output',
          conditions: [{ field: 'resolution', operator: 'eq', value: '1080P' }],
          charges: [{ meter: 'seconds', unit: '秒', price: 0.1 }],
        },
      ],
    }

    expect(
      findComparisonUsageCharge(vendor, 'request', actualRule, outputCharge)
        ?.price
    ).toBe(0.1)
  })

  it('survives a tier rename when the matching charge has one unique price', () => {
    const vendor: UsageRuleSet = {
      version: 1,
      execution: 'request',
      rules: [{
        id: 'old',
        label: 'Old tier name',
        conditions: [{ field: 'quality', operator: 'eq', value: 'standard' }],
        charges: [{ meter: 'seconds', unit: '秒', price: 0.1 }],
      }],
    }

    expect(
      findComparisonUsageCharge(vendor, 'request', actualRule, outputCharge)
        ?.price
    ).toBe(0.1)
  })

  it('refuses an ambiguous meter/unit fallback instead of showing a wrong price', () => {
    const vendor: UsageRuleSet = {
      version: 1,
      execution: 'request',
      rules: [
        {
          id: 'sd',
          label: 'SD',
          conditions: [{ field: 'resolution', operator: 'eq', value: '720P' }],
          charges: [{ meter: 'seconds', unit: '秒', price: 0.08 }],
        },
        {
          id: 'uhd',
          label: 'UHD',
          conditions: [{ field: 'resolution', operator: 'eq', value: '4K' }],
          charges: [{ meter: 'seconds', unit: '秒', price: 0.2 }],
        },
      ],
    }

    expect(
      findComparisonUsageCharge(vendor, 'request', actualRule, outputCharge)
    ).toBeUndefined()
  })

  it('does not compare request rules with task-settlement rules', () => {
    const vendor: UsageRuleSet = {
      version: 1,
      execution: 'task',
      rules: [{ ...actualRule, charges: [{ ...outputCharge, price: 0.1 }] }],
    }

    expect(
      findComparisonUsageCharge(vendor, 'request', actualRule, outputCharge)
    ).toBeUndefined()
  })
})

describe('screenshot-derived billing templates', () => {
  it('labels seconds as audio duration only in the audio-duration template', () => {
    expect(usageFieldLabel('seconds', 'audioSeconds')).toBe('Audio duration')
    expect(usageFieldLabel('seconds', 'video')).toBe('Output video duration')
  })
  it('updates generated media tier names without rewriting custom labels or prices', () => {
    const original = createUsageRuleTemplate('volume', 'request').rules
    const changed = syncExampleTierNames(original, 25, 30)
    expect(changed[0].label).toBe('≤ 30 张')
    expect(changed[1].label).toBe('31 - 125 张')
    expect(changed[0].charges).toEqual(original[0].charges)
    expect(
      syncExampleTierNames(
        [{ ...original[0], label: '自定义批量档' }],
        25,
        128
      )[0].label
    ).toBe('自定义批量档')
    const video = createUsageRuleTemplate('video', 'request').rules
    expect(video[1].label).toBe('其他视频分辨率')
    expect(syncExampleTierNames(video, '720P', '480P')[0].label).toBe('480P')
    expect(
      syncExampleTierNames(
        syncExampleTierNames(video, '720P', ''),
        '',
        '480P'
      )[0].label
    ).toBe('480P')
  })
  it('keeps the stable billing capability contract represented', () => {
    const presets = PLATFORM_BILLING_PRESET_GROUPS.flatMap(
      (group) => group.presets
    )
    const expressions = presets.map((preset) => preset.expr)
    expect(BILLING_CAPABILITY_CONTRACT).toContain(
      'shared-input-output-branches'
    )
    expect(
      expressions.some((expr) =>
        expr.includes('text+audio output (audio only)')
      )
    ).toBe(true)
    expect(expressions.some((expr) => expr.includes('ao > 0'))).toBe(true)
  })

  it('keeps every supported visual template valid and executable', () => {
    expect(BILLING_TEMPLATE_KEYS).toEqual(
      ADVANCED_MEDIA_TEMPLATE_REGISTRY.map(({ key }) => key)
    )

    for (const key of BILLING_TEMPLATE_KEYS) {
      const rules = createUsageRuleTemplate(key, 'request')
      const contract = ADVANCED_MEDIA_TEMPLATE_REGISTRY.find(
        (item) => item.key === key
      )
      expect(contract, key).toBeDefined()
      expect(contract?.purpose, key).not.toBe('')
      expect(contract?.defaultTiers, key).not.toBe('')
      expect(contract?.layout.editor, key).not.toBe('')
      expect(contract?.layout.managementDisplay, key).not.toBe('')
      expect(contract?.layout.publicDisplay, key).not.toBe('')
      expect(contract?.runtime, key).not.toBe('')
      expect(contract?.compatibility, key).not.toBe('')
      expect(
        [
          ...new Set(
            rules.rules.flatMap((item) =>
              item.conditions.map(({ field }) => field)
            )
          ),
        ].sort(),
        key
      ).toEqual([...(contract?.conditionFields || [])].sort())
      expect(
        [
          ...new Set(
            rules.rules.flatMap((item) =>
              item.charges.map(({ meter }) => meter)
            )
          ),
        ].sort(),
        key
      ).toEqual([...(contract?.chargeMeters || [])].sort())
      expect(validateUsageRuleSet(rules), key).toBe('')
      const expression = usageRuleSetExpression(rules)
      expect(compileBillingExpression(expression), key).toMatchObject({
        status: 'ready',
      })
      expect(
        evaluateBillingExpression(expression, {
          request: { body: {} },
          usage: {
            resolution: '1080P',
            resolution_tier: '2K',
            quality: 'standard',
            mode: 'wan-std',
            prompt_extend: false,
            audio: false,
            input_images: 1,
            output_images: 1,
            seconds: 1,
            characters: 1,
            tts_input_characters: 1,
            tts_output_characters: 1,
            count: 1,
            task_type: 'text-to-3d',
            output_spec: 'standard-no-texture',
          },
        }),
        key
      ).toMatchObject({ status: 'success' })
    }
  })

  it('charges standard image generation by the actual output image count', () => {
    const rules = createUsageRuleTemplate('outputImageCount', 'request')
    rules.rules[0].charges[0].price = 0.5

    const expression = usageRuleSetExpression(rules)

    expect(expression).toContain('fixed(0.5)) * image_count')
    expect(
      evaluateBillingExpression(expression, {
        imageCount: 3,
        request: { body: { n: 3 } },
      })
    ).toMatchObject({
      status: 'success',
      cost: 1_500_000,
    })
  })

  it('uses native image_count for requests and output_images usage for tasks', () => {
    const requestExpression = usageRuleSetExpression(
      createUsageRuleTemplate('volume', 'request')
    )
    const taskRules = createUsageRuleTemplate('outputImageCount', 'task')
    taskRules.rules[0].charges[0].price = 0.5
    const taskExpression = usageRuleSetExpression(taskRules)

    expect(requestExpression).toContain('image_count')
    expect(requestExpression).not.toContain('u("output_images")')
    expect(taskExpression).toContain('u("output_images")')
    expect(taskExpression).not.toContain('image_count')
  })

  it('charges TTS input by ten-thousand characters and keeps zero output free', () => {
    const rules = createUsageRuleTemplate('ttsCharacters', 'request')
    expect(rules.rules[0].label).toBe('按万字符计费')
    expect(rules.rules[0].charges).toEqual([
      { meter: 'tts_input_characters', unit: '万字符', price: 0.8 },
      { meter: 'tts_output_characters', unit: '万字符', price: 0 },
    ])

    const expression = usageRuleSetExpression(rules)
    expect(expression).toContain('u("tts_input_characters") * 80')
    expect(expression).not.toContain('tts_output_characters')

    expect(
      evaluateBillingExpression(expression, {
        usage: {
          tts_input_characters: 10_000,
          tts_output_characters: 10_000,
        },
      }),
    ).toMatchObject({
      status: 'success',
      cost: 800_000,
      matchedTier: '按万字符计费',
    })
  })
})
