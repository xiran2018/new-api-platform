import { describe, expect, it } from 'vitest'

import { compileBillingExpression } from '@/features/pricing/lib/billing-expression/parser'
import { evaluateBillingExpression } from '@/features/pricing/lib/billing-expression/runtime'
import { BILLING_CAPABILITY_CONTRACT } from '@/platform/model-prices/billing-capability-contract'
import { ADVANCED_MEDIA_TEMPLATE_REGISTRY } from '@/platform/model-prices/billing-template-registry'
import { PLATFORM_BILLING_PRESET_GROUPS } from '@/platform/model-prices/expression-presets'

import {
  BILLING_TEMPLATE_KEYS,
  createUsageRuleTemplate,
  syncExampleTierNames,
  usageRuleSetExpression,
  validateUsageRuleSet,
} from './usage-rule-builder'

describe('screenshot-derived billing templates', () => {
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
})
