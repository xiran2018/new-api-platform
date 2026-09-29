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
  unsupportedTaskUsageKeys,
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

describe('task usage-schema compatibility', () => {
  it('rejects a resolution template when the task plugin only declares image_count', () => {
    const rules = createUsageRuleTemplate('image', 'task')
    expect(unsupportedTaskUsageKeys(rules, {
      image_count: { type: 'number', unit: 'count' },
    })).toEqual(['input_images', 'output_images', 'resolution_tier'])
  })

  it('allows image-count templates for the Alibaba task schema', () => {
    const rules = createUsageRuleTemplate('outputImageCount', 'task')
    expect(unsupportedTaskUsageKeys(rules, {
      image_count: { type: 'number', unit: 'count' },
    })).toEqual([])
  })
})

describe('screenshot-derived billing templates', () => {
  it('labels seconds as audio duration only in the audio-duration template', () => {
    expect(usageFieldLabel('seconds', 'audioSeconds')).toBe('Audio duration')
    expect(usageFieldLabel('seconds', 'video')).toBe('Output video duration')
    expect(
      usageFieldLabel('live_session_seconds', 'liveSessionSeconds')
    ).toBe('GPT-Live session connection duration')
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
            live_session_seconds: 30,
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

  it('charges Qwen image tiers by resolution, input image count and output image count', () => {
    const rules = createUsageRuleTemplate('image', 'task')
    rules.rules[0].charges[0].price = 0.02
    rules.rules[0].charges[1].price = 0.25
    rules.rules[1].charges[0].price = 0.02
    rules.rules[1].charges[1].price = 0.5
    rules.rules[2].charges[0].price = 0.02
    rules.rules[2].charges[1].price = 0.5

    const expression = usageRuleSetExpression(rules)
    expect(compileBillingExpression(expression)).toMatchObject({ status: 'ready' })
    expect(
      evaluateBillingExpression(expression, {
        usage: { resolution_tier: '1K', input_images: 1, output_images: 1 },
      }),
    ).toMatchObject({ status: 'success', cost: 0.27, matchedTier: '1K' })
    expect(
      evaluateBillingExpression(expression, {
        usage: { resolution_tier: '2K', input_images: 2, output_images: 1 },
      }),
    ).toMatchObject({ status: 'success', cost: 0.54, matchedTier: '2K' })
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

  it('charges one configurable price for a one-song-per-request music API', () => {
    const rules = createUsageRuleTemplate('musicPerSong', 'request')
    expect(rules.rules).toEqual([
      expect.objectContaining({
        label: '音乐生成按歌曲/请求计费',
        conditions: [],
        charges: [{ meter: 'request', unit: '次', price: 0.08 }],
      }),
    ])

    const expression = usageRuleSetExpression(rules)
    expect(expression).toBe('tier("音乐生成按歌曲/请求计费", 80000)')
    expect(evaluateBillingExpression(expression, {})).toMatchObject({
      status: 'success',
      cost: 80_000,
      matchedTier: '音乐生成按歌曲/请求计费',
    })
  })

  it('uses native image_count for requests and task usage facts', () => {
    const requestExpression = usageRuleSetExpression(
      createUsageRuleTemplate('volume', 'request')
    )
    const taskRules = createUsageRuleTemplate('outputImageCount', 'task')
    taskRules.rules[0].charges[0].price = 0.5
    const taskExpression = usageRuleSetExpression(taskRules)

    expect(requestExpression).toContain('image_count')
    expect(requestExpression).not.toContain('u("output_images")')
    expect(taskExpression).toContain('u("image_count")')
    expect(taskExpression).not.toContain('fixed(')
    expect(
      evaluateBillingExpression(taskExpression, {
        usage: { image_count: 3 },
      }),
    ).toMatchObject({ status: 'success', cost: 1.5 })
  })

  it('keeps task image-count pricing compatible with plugin usage facts', () => {
    const rules = createUsageRuleTemplate('outputImageCount', 'task')
    rules.rules[0].charges[0].price = 0.2
    const expression = usageRuleSetExpression(rules)
    expect(compileBillingExpression(expression)).toMatchObject({ status: 'ready' })
    expect(expression).toBe('tier("按输出图片张数", u("image_count") * 0.2)')
  })

  it('charges GPT-Live by exact connection seconds with a per-minute price', () => {
    const rules = createUsageRuleTemplate('liveSessionSeconds', 'request')
    expect(rules.rules[0].charges).toEqual([
      {
        meter: 'live_session_seconds',
        unit: '分钟',
        price: 0.05,
      },
    ])

    const expression = usageRuleSetExpression(rules)
    expect(expression).toContain('u("live_session_seconds")')
    const result = evaluateBillingExpression(expression, {
      usage: { live_session_seconds: 30 },
    })
    expect(result).toMatchObject({
      status: 'success',
      matchedTier: 'GPT-Live session connection duration',
    })
    expect(result.status === 'success' ? result.cost : 0).toBeCloseTo(25_000, 8)
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
