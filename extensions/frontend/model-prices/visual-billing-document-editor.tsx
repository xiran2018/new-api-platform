import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import type { PricingCurrency } from '@/features/model-pricing/currency'
import { PricingAmountInput } from '@/features/model-pricing/pricing-amount-input'
import type {
  VisualBillingDocument,
  VisualBillingIssue,
  VisualPrice,
  VisualPricingNode,
} from '@/features/pricing/lib/billing-expression/visual'
import { PricingFieldAddon } from '@/platform/model-prices/pricing-field-addon'

export type PlatformVisualBillingDocumentEditorProps = {
  document: VisualBillingDocument
  currency: PricingCurrency
  issues: VisualBillingIssue[]
  onChange: (document: VisualBillingDocument) => void
}

type OmniOutputKind = 'pure' | 'multimodal' | 'audio'
type SharedTextImageAudioOutputKind = 'multimodal' | 'audio'
type OmniTierMatch = {
  tier: Extract<VisualPricingNode, { kind: 'tier' }>
  scopeId: string
}
type SharedTextImageAudioOutputTierMatch = {
  tier: Extract<VisualPricingNode, { kind: 'tier' }>
  scopeId: string
}
type AudioImageInputOutputTierMatch = {
  tier: Extract<VisualPricingNode, { kind: 'tier' }>
  scopeId: string
}
type TextAudioInputOutputTierMatch = {
  tier: Extract<VisualPricingNode, { kind: 'tier' }>
  scopeId: string
}
type AudioTokenOutputKind = 'audio' | 'text'
type AudioTokenOutputTierMatch = {
  tier: Extract<VisualPricingNode, { kind: 'tier' }>
  scopeId: string
}
type GeminiCachePricingKind = 'unified' | 'audio-split'
type GeminiCachePricingTierMatch = {
  tier: Extract<VisualPricingNode, { kind: 'tier' }>
  scopeId: string
}
type SimpleModalityPricingField = {
  label: string
  variable: VisualPrice['variable']
  variables?: VisualPrice['variable'][]
  hint?: string
}
type SimpleModalityPricingConfig = {
  marker: string
  title: string
  description: string
  fields: SimpleModalityPricingField[]
}

const SHARED_MEDIA_MARKER = 'shared image/video input'
const SHARED_TEXT_IMAGE_VIDEO_MARKER = 'shared text/image/video input'
const SHARED_TEXT_IMAGE_MARKER = 'shared text/image input'
const AUDIO_IMAGE_INPUT_OUTPUT_MARKER = 'audio/image input + text/audio output'
const TEXT_AUDIO_INPUT_OUTPUT_MARKER = 'text/audio input + text/audio output'
const AUDIO_INPUT_AUDIO_OUTPUT_TOKEN_MARKER =
  'audio input + audio output token pricing'
const AUDIO_INPUT_TEXT_OUTPUT_TOKEN_MARKER =
  'audio input + text output token pricing'
const GEMINI_UNIFIED_CACHE_MARKER =
  'gemini flash lite easy unified input/output'
const GEMINI_AUDIO_CACHE_MARKER = 'gemini flash lite easy audio split'
const SIMPLE_MODALITY_PRICING_CONFIGS: SimpleModalityPricingConfig[] = [
  {
    marker: 'gemini omni easy shared input text/video output',
    title: 'Gemini Omni shared multimodal input + text/video output pricing',
    description:
      'Fill one shared multimodal input price, one text output price, and one video output price.',
    fields: [
      {
        label: 'Text/image/video/audio input',
        variable: 'p',
        variables: ['p', 'img', 'vid', 'ai'],
        hint: 'One price is applied to text, image, video, and audio input tokens.',
      },
      { label: 'Text output', variable: 'c' },
      { label: 'Video output', variable: 'vid_o' },
    ],
  },
  {
    marker: 'gemini image easy shared input text/image output',
    title: 'Gemini image shared input + text/image output pricing',
    description:
      'Fill one shared text/image input price, one text output price, and one image output price.',
    fields: [
      {
        label: 'Text/image input',
        variable: 'p',
        variables: ['p', 'img'],
        hint: 'One price is applied to text and image input tokens.',
      },
      { label: 'Text output', variable: 'c' },
      { label: 'Image output', variable: 'img_o' },
    ],
  },
  {
    marker: 'gemini image easy shared text/image/video input/output',
    title: 'Gemini image shared text/image/video input + text/thinking and image output pricing',
    description:
      'Fill one shared text/image/video input price, one text/thinking output price, and one image output price.',
    fields: [
      {
        label: 'Text/image/video input',
        variable: 'p',
        variables: ['p', 'img', 'vid'],
        hint: 'One price is applied to text, image, and video input tokens.',
      },
      { label: 'Text/thinking output', variable: 'c' },
      { label: 'Image output', variable: 'img_o' },
    ],
  },
  {
    marker: 'gemini native audio easy text/media input/output',
    title: 'Gemini Native Audio text/media input + text/audio output pricing',
    description:
      'Fill the text input, shared audio/video input, text output, and audio output prices directly.',
    fields: [
      { label: 'Text input', variable: 'p' },
      {
        label: 'Audio/video input',
        variable: 'ai',
        variables: ['ai', 'vid'],
        hint: 'One price is applied to audio and video input tokens.',
      },
      { label: 'Text output', variable: 'c' },
      { label: 'Audio output', variable: 'ao' },
    ],
  },
  {
    marker: 'gemini robotics easy unified input/cache/output',
    title: 'Gemini Robotics unified input + cached input + output pricing',
    description:
      'Fill one text/image/video/audio input price, one cached input price, and one output price. Use the final selected prices instead of date-based stages.',
    fields: [
      {
        label: 'Text/image/video/audio input',
        variable: 'p',
        variables: ['p', 'img', 'vid', 'ai'],
        hint: 'One price is applied to text, image, video, and audio input tokens.',
      },
      { label: 'Cached input', variable: 'cr' },
      { label: 'Output price', variable: 'c' },
    ],
  },
  {
    marker: 'gemini tts easy text cache audio output',
    title: 'Gemini TTS text input + cached input + audio output pricing',
    description:
      'Fill the text input, cached input, and audio output prices directly. Use one final price instead of date-based stages.',
    fields: [
      { label: 'Text input', variable: 'p' },
      { label: 'Cached input', variable: 'cr' },
      { label: 'Audio output', variable: 'ao' },
    ],
  },
  {
    marker: 'gemini embedding easy multimodal input',
    title: 'Gemini multimodal embedding input pricing',
    description:
      'Fill text, image, audio, and video input prices directly. This template has no output charge.',
    fields: [
      { label: 'Text input', variable: 'p' },
      { label: 'Image input', variable: 'img' },
      { label: 'Audio input', variable: 'ai' },
      { label: 'Video input', variable: 'vid' },
    ],
  },
]

function omniOutputKind(label: string): OmniOutputKind | null {
  const normalized = label.toLowerCase()
  if (!normalized.includes(SHARED_MEDIA_MARKER)) return null
  if (normalized.startsWith('pure text output')) return 'pure'
  if (normalized.startsWith('multimodal text output')) return 'multimodal'
  if (normalized.startsWith('text+audio output')) return 'audio'
  return null
}

function collectOmniTiers(
  node: VisualPricingNode,
  result = new Map<OmniOutputKind, OmniTierMatch>(),
  prefix = ''
) {
  const rules: VisualPricingNode[] = []
  let current = node
  while (current.kind === 'branch') {
    rules.push(current)
    current = current.no
  }
  rules.push(current)
  rules.forEach((rule, index) => {
    const scopeId = `${prefix}${index + 1}`
    const tier = rule.kind === 'tier' ? rule : rule.yes
    if (tier.kind === 'branch') {
      collectOmniTiers(tier, result, `${scopeId}.`)
      return
    }
    const kind = omniOutputKind(tier.label)
    if (kind) result.set(kind, { tier, scopeId })
  })
  return result
}

function sharedTextImageAudioOutputKind(
  label: string
): SharedTextImageAudioOutputKind | null {
  const normalized = label.toLowerCase()
  if (
    !normalized.includes(SHARED_TEXT_IMAGE_VIDEO_MARKER) &&
    !normalized.includes(SHARED_TEXT_IMAGE_MARKER)
  ) return null
  if (normalized.startsWith('multimodal text output')) return 'multimodal'
  if (normalized.startsWith('text+audio output')) return 'audio'
  return null
}

function collectSharedTextImageAudioOutputTiers(
  node: VisualPricingNode,
  result = new Map<
    SharedTextImageAudioOutputKind,
    SharedTextImageAudioOutputTierMatch
  >(),
  prefix = ''
) {
  const rules: VisualPricingNode[] = []
  let current = node
  while (current.kind === 'branch') {
    rules.push(current)
    current = current.no
  }
  rules.push(current)
  rules.forEach((rule, index) => {
    const scopeId = `${prefix}${index + 1}`
    const tier = rule.kind === 'tier' ? rule : rule.yes
    if (tier.kind === 'branch') {
      collectSharedTextImageAudioOutputTiers(tier, result, `${scopeId}.`)
      return
    }
    const kind = sharedTextImageAudioOutputKind(tier.label)
    if (kind) result.set(kind, { tier, scopeId })
  })
  return result
}

function findTextAudioInputOutputTier(
  node: VisualPricingNode,
  prefix = ''
): TextAudioInputOutputTierMatch | null {
  if (node.kind === 'tier') {
    return node.label.toLowerCase().startsWith(TEXT_AUDIO_INPUT_OUTPUT_MARKER)
      ? { tier: node, scopeId: prefix || '1' }
      : null
  }
  return (
    findTextAudioInputOutputTier(node.yes, `${prefix}1.`) ||
    findTextAudioInputOutputTier(node.no, `${prefix}2.`)
  )
}

function findAudioImageInputOutputTier(
  node: VisualPricingNode,
  prefix = ''
): AudioImageInputOutputTierMatch | null {
  if (node.kind === 'tier') {
    return node.label.toLowerCase().startsWith(AUDIO_IMAGE_INPUT_OUTPUT_MARKER)
      ? { tier: node, scopeId: prefix || '1' }
      : null
  }
  return (
    findAudioImageInputOutputTier(node.yes, `${prefix}1.`) ||
    findAudioImageInputOutputTier(node.no, `${prefix}2.`)
  )
}

function audioTokenOutputMarker(kind: AudioTokenOutputKind) {
  return kind === 'audio'
    ? AUDIO_INPUT_AUDIO_OUTPUT_TOKEN_MARKER
    : AUDIO_INPUT_TEXT_OUTPUT_TOKEN_MARKER
}

function findAudioTokenOutputTier(
  node: VisualPricingNode,
  kind: AudioTokenOutputKind,
  prefix = ''
): AudioTokenOutputTierMatch | null {
  if (node.kind === 'tier') {
    return node.label.toLowerCase().startsWith(audioTokenOutputMarker(kind))
      ? { tier: node, scopeId: prefix || '1' }
      : null
  }
  return (
    findAudioTokenOutputTier(node.yes, kind, `${prefix}1.`) ||
    findAudioTokenOutputTier(node.no, kind, `${prefix}2.`)
  )
}

function findGeminiCachePricingTier(
  node: VisualPricingNode,
  kind: GeminiCachePricingKind,
  prefix = ''
): GeminiCachePricingTierMatch | null {
  const marker =
    kind === 'unified'
      ? GEMINI_UNIFIED_CACHE_MARKER
      : GEMINI_AUDIO_CACHE_MARKER
  if (node.kind === 'tier') {
    return node.label.toLowerCase().startsWith(marker)
      ? { tier: node, scopeId: prefix || '1' }
      : null
  }
  return (
    findGeminiCachePricingTier(node.yes, kind, `${prefix}1.`) ||
    findGeminiCachePricingTier(node.no, kind, `${prefix}2.`)
  )
}

function updateGeminiCachePricingTier(
  node: VisualPricingNode,
  kind: GeminiCachePricingKind,
  variables: VisualPrice['variable'][],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateGeminiCachePricingTier(node.yes, kind, variables, value),
      no: updateGeminiCachePricingTier(node.no, kind, variables, value),
    }
  }
  const marker =
    kind === 'unified'
      ? GEMINI_UNIFIED_CACHE_MARKER
      : GEMINI_AUDIO_CACHE_MARKER
  return node.label.toLowerCase().startsWith(marker)
    ? { ...node, prices: updatePrices(node.prices, variables, value) }
    : node
}

function findSimpleModalityPricingTier(
  node: VisualPricingNode,
  config: SimpleModalityPricingConfig,
  prefix = ''
): GeminiCachePricingTierMatch | null {
  if (node.kind === 'tier') {
    return node.label.toLowerCase().startsWith(config.marker)
      ? { tier: node, scopeId: prefix || '1' }
      : null
  }
  return (
    findSimpleModalityPricingTier(node.yes, config, `${prefix}1.`) ||
    findSimpleModalityPricingTier(node.no, config, `${prefix}2.`)
  )
}

function simpleModalityPricingConfig(document: VisualBillingDocument) {
  if (document.shared) return null
  return (
    SIMPLE_MODALITY_PRICING_CONFIGS.find((config) => {
      const match = findSimpleModalityPricingTier(document.root, config)
      if (!match) return false
      const variables = new Set(match.tier.prices.map((price) => price.variable))
      return config.fields
        .flatMap((field) => field.variables || [field.variable])
        .every((variable) => variables.has(variable))
    }) || null
  )
}

function updateSimpleModalityPricingTier(
  node: VisualPricingNode,
  config: SimpleModalityPricingConfig,
  variables: VisualPrice['variable'][],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateSimpleModalityPricingTier(node.yes, config, variables, value),
      no: updateSimpleModalityPricingTier(node.no, config, variables, value),
    }
  }
  return node.label.toLowerCase().startsWith(config.marker)
    ? { ...node, prices: updatePrices(node.prices, variables, value) }
    : node
}

export function supportsPlatformVisualBillingDocumentEditor(
  document: VisualBillingDocument
) {
  const sharedVariables = new Set(
    document.shared?.prices.map((price) => price.variable) || []
  )
  const tiers = collectOmniTiers(document.root)
  const supportsOmniEditor = (
    ['p', 'ai', 'img', 'vid'].every((variable) =>
      sharedVariables.has(variable as VisualPrice['variable'])
    ) &&
    tiers.has('pure') &&
    tiers.has('multimodal') &&
    tiers.has('audio')
  )
  return (
    supportsOmniEditor ||
    supportsGeminiCachePricingEditor(document, 'unified') ||
    supportsGeminiCachePricingEditor(document, 'audio-split') ||
    Boolean(simpleModalityPricingConfig(document)) ||
    supportsAudioTokenOutputEditor(document, 'audio') ||
    supportsAudioTokenOutputEditor(document, 'text') ||
    supportsSharedTextImageAudioOutputEditor(document) ||
    supportsAudioImageInputOutputEditor(document) ||
    supportsTextAudioInputOutputEditor(document)
  )
}

export function supportsGeminiCachePricingEditor(
  document: VisualBillingDocument,
  kind: GeminiCachePricingKind
) {
  const match = findGeminiCachePricingTier(document.root, kind)
  if (!match || document.shared) return false
  const variables = new Set(match.tier.prices.map((price) => price.variable))
  const required =
    kind === 'unified'
      ? ['p', 'img', 'vid', 'ai', 'cr', 'c']
      : ['p', 'img', 'vid', 'ai', 'cr', 'ai_cr', 'c']
  return required.every((variable) =>
    variables.has(variable as VisualPrice['variable'])
  )
}

export function supportsAudioTokenOutputEditor(
  document: VisualBillingDocument,
  kind: AudioTokenOutputKind
) {
  const match = findAudioTokenOutputTier(document.root, kind)
  if (!match || document.shared) return false
  const variables = new Set(match.tier.prices.map((price) => price.variable))
  const outputVariable = kind === 'audio' ? 'ao' : 'c'
  return variables.has('ai') && variables.has(outputVariable)
}

export function supportsTextAudioInputOutputEditor(
  document: VisualBillingDocument
) {
  const match = findTextAudioInputOutputTier(document.root)
  if (!match || document.shared) return false
  const variables = new Set(match.tier.prices.map((price) => price.variable))
  return ['p', 'ai', 'c', 'ao'].every((variable) =>
    variables.has(variable as VisualPrice['variable'])
  )
}

export function supportsAudioImageInputOutputEditor(
  document: VisualBillingDocument
) {
  const match = findAudioImageInputOutputTier(document.root)
  if (!match || document.shared) return false
  const variables = new Set(match.tier.prices.map((price) => price.variable))
  return ['ai', 'img', 'c', 'ao'].every((variable) =>
    variables.has(variable as VisualPrice['variable'])
  )
}

export function supportsSharedTextImageAudioOutputEditor(
  document: VisualBillingDocument
) {
  const sharedVariables = new Set(
    document.shared?.prices.map((price) => price.variable) || []
  )
  const tiers = collectSharedTextImageAudioOutputTiers(document.root)
  const hasTextImageOnlyMarker = Array.from(tiers.values()).some(({ tier }) =>
    tier.label.toLowerCase().includes(SHARED_TEXT_IMAGE_MARKER)
  )
  return (
    ['p', 'img', 'ai'].every((variable) =>
      sharedVariables.has(variable as VisualPrice['variable'])
    ) &&
    (sharedVariables.has('vid') || hasTextImageOnlyMarker) &&
    tiers.has('multimodal') &&
    tiers.has('audio')
  )
}

function priceValue(
  prices: VisualPrice[] | undefined,
  variable: VisualPrice['variable']
) {
  return prices?.find((price) => price.variable === variable)?.value ?? '0'
}

function updatePrices(
  prices: VisualPrice[],
  variables: VisualPrice['variable'][],
  value: string
) {
  const targets = new Set(variables)
  const existing = new Set<VisualPrice['variable']>()
  const updated = prices.map((price) => {
    if (!targets.has(price.variable)) return price
    existing.add(price.variable)
    return { ...price, value }
  })
  for (const variable of variables) {
    if (!existing.has(variable)) updated.push({ variable, value })
  }
  return updated
}

function updateOmniTier(
  node: VisualPricingNode,
  kind: OmniOutputKind,
  variable: VisualPrice['variable'],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateOmniTier(node.yes, kind, variable, value),
      no: updateOmniTier(node.no, kind, variable, value),
    }
  }
  return omniOutputKind(node.label) === kind
    ? { ...node, prices: updatePrices(node.prices, [variable], value) }
    : node
}

function updateSharedTextImageAudioOutputTier(
  node: VisualPricingNode,
  kind: SharedTextImageAudioOutputKind,
  variable: VisualPrice['variable'],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateSharedTextImageAudioOutputTier(node.yes, kind, variable, value),
      no: updateSharedTextImageAudioOutputTier(node.no, kind, variable, value),
    }
  }
  return sharedTextImageAudioOutputKind(node.label) === kind
    ? { ...node, prices: updatePrices(node.prices, [variable], value) }
    : node
}

function PriceCell({
  label,
  value,
  currency,
  onChange,
  hint,
  addonKey,
  addonScope,
  addonScopeId,
}: {
  label: string
  value: string
  currency: PricingCurrency
  onChange: (value: string) => void
  hint?: string
  addonKey: VisualPrice['variable']
  addonScope?: string
  addonScopeId?: string
}) {
  return (
    <td className='min-w-36 border-r p-2 align-top last:border-r-0'>
      <Label className='sr-only'>{label}</Label>
      <PricingAmountInput
        aria-label={label}
        currency={currency}
        value={value}
        onChange={onChange}
        className='h-8 w-full'
      />
      {hint && <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>}
      <PricingFieldAddon
        fieldKey={addonKey}
        scope={addonScope}
        scopeId={addonScopeId}
        value={value}
      />
    </td>
  )
}

function SharedTextImageAudioOutputEditor(
  props: PlatformVisualBillingDocumentEditorProps
) {
  const { t } = useTranslation()
  const shared = props.document.shared
  const tiers = collectSharedTextImageAudioOutputTiers(props.document.root)
  if (!shared || tiers.size !== 2) return null
  const hasVideo = shared.prices.some((price) => price.variable === 'vid')
  const sharedInputLabel = hasVideo
    ? 'Text/image/video input'
    : 'Text/image input'
  const sharedInputHint = hasVideo
    ? 'One price is applied to text, image, and video input.'
    : 'One price is applied to text and image input.'

  const updateShared = (variables: VisualPrice['variable'][], value: string) =>
    props.onChange({
      ...props.document,
      shared: {
        ...shared,
        prices: updatePrices(shared.prices, variables, value),
      },
    })
  const updateOutput = (
    kind: SharedTextImageAudioOutputKind,
    variable: VisualPrice['variable'],
    value: string
  ) =>
    props.onChange({
      ...props.document,
      root: updateSharedTextImageAudioOutputTier(
        props.document.root,
        kind,
        variable,
        value
      ),
    })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>
          {t(
            hasVideo
              ? 'Shared text/image/video input + audio input + multimodal/audio output pricing'
              : 'Shared text/image input + audio input + multimodal/audio output pricing'
          )}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t(
            hasVideo
              ? 'Text, image, and video share one input price. Audio input and the two output modes are priced separately.'
              : 'Text and image share one input price. Audio input and the two output modes are priced separately.'
          )}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[760px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th colSpan={2} className='border-b border-r p-2 text-center font-medium'>
                {t('Input unit price')}
              </th>
              <th colSpan={2} className='border-b p-2 text-center font-medium'>
                {t('Output unit price')}
              </th>
            </tr>
            <tr>
              <th className='border-r p-2 text-left font-medium'>
                {t(sharedInputLabel)}
              </th>
              <th className='border-r p-2 text-left font-medium'>{t('Audio input')}</th>
              <th className='border-r p-2 text-left font-medium'>
                {t('Text output')}
                <span className='ml-1 font-normal'>({t('Multimodal input')})</span>
              </th>
              <th className='p-2 text-left font-medium'>
                {t('Text + audio output')}
                <span className='ml-1 font-normal'>({t('Audio only billed')})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              <PriceCell
                label={t(sharedInputLabel)}
                value={priceValue(shared.prices, 'p')}
                currency={props.currency}
                onChange={(value) =>
                  updateShared(hasVideo ? ['p', 'img', 'vid'] : ['p', 'img'], value)
                }
                hint={t(sharedInputHint)}
                addonKey='p'
                addonScopeId='shared'
              />
              <PriceCell
                label={t('Audio input')}
                value={priceValue(shared.prices, 'ai')}
                currency={props.currency}
                onChange={(value) => updateShared(['ai'], value)}
                addonKey='ai'
                addonScopeId='shared'
              />
              <PriceCell
                label={t('Text output (multimodal input)')}
                value={priceValue(tiers.get('multimodal')?.tier.prices, 'c')}
                currency={props.currency}
                onChange={(value) => updateOutput('multimodal', 'c', value)}
                addonKey='c'
                addonScope={tiers.get('multimodal')?.tier.label}
                addonScopeId={tiers.get('multimodal')?.scopeId}
              />
              <PriceCell
                label={t('Text + audio output (audio only billed)')}
                value={priceValue(tiers.get('audio')?.tier.prices, 'ao')}
                currency={props.currency}
                onChange={(value) => updateOutput('audio', 'ao', value)}
                addonKey='ao'
                addonScope={tiers.get('audio')?.tier.label}
                addonScopeId={tiers.get('audio')?.scopeId}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function updateTextAudioInputOutputTier(
  node: VisualPricingNode,
  variable: VisualPrice['variable'],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateTextAudioInputOutputTier(node.yes, variable, value),
      no: updateTextAudioInputOutputTier(node.no, variable, value),
    }
  }
  return node.label.toLowerCase().startsWith(TEXT_AUDIO_INPUT_OUTPUT_MARKER)
    ? { ...node, prices: updatePrices(node.prices, [variable], value) }
    : node
}

function updateAudioImageInputOutputTier(
  node: VisualPricingNode,
  variable: VisualPrice['variable'],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateAudioImageInputOutputTier(node.yes, variable, value),
      no: updateAudioImageInputOutputTier(node.no, variable, value),
    }
  }
  return node.label.toLowerCase().startsWith(AUDIO_IMAGE_INPUT_OUTPUT_MARKER)
    ? { ...node, prices: updatePrices(node.prices, [variable], value) }
    : node
}

function updateAudioTokenOutputTier(
  node: VisualPricingNode,
  kind: AudioTokenOutputKind,
  variable: VisualPrice['variable'],
  value: string
): VisualPricingNode {
  if (node.kind === 'branch') {
    return {
      ...node,
      yes: updateAudioTokenOutputTier(node.yes, kind, variable, value),
      no: updateAudioTokenOutputTier(node.no, kind, variable, value),
    }
  }
  return node.label.toLowerCase().startsWith(audioTokenOutputMarker(kind))
    ? { ...node, prices: updatePrices(node.prices, [variable], value) }
    : node
}

function AudioTokenOutputEditor({
  kind,
  ...props
}: PlatformVisualBillingDocumentEditorProps & {
  kind: AudioTokenOutputKind
}) {
  const { t } = useTranslation()
  const match = findAudioTokenOutputTier(props.document.root, kind)
  if (!match) return null
  const outputVariable = kind === 'audio' ? 'ao' : 'c'
  const outputLabel = kind === 'audio' ? 'Audio output' : 'Text output'

  const update = (variable: VisualPrice['variable'], value: string) =>
    props.onChange({
      ...props.document,
      root: updateAudioTokenOutputTier(
        props.document.root,
        kind,
        variable,
        value
      ),
    })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>
          {t(
            kind === 'audio'
              ? 'Audio input + audio output token pricing'
              : 'Audio input + text output token pricing'
          )}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t(
            kind === 'audio'
              ? 'Fill two prices directly: audio input and audio output per 1M tokens.'
              : 'Fill two prices directly: audio input and text output per 1M tokens.'
          )}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[420px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th className='border-b border-r p-2 text-center font-medium'>
                {t('Input unit price')}
              </th>
              <th className='border-b p-2 text-center font-medium'>
                {t('Output unit price')}
              </th>
            </tr>
            <tr>
              <th className='border-r p-2 text-left font-medium'>
                {t('Audio input')}
              </th>
              <th className='p-2 text-left font-medium'>{t(outputLabel)}</th>
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              <PriceCell
                label={t('Audio input')}
                value={priceValue(match.tier.prices, 'ai')}
                currency={props.currency}
                onChange={(value) => update('ai', value)}
                addonKey='ai'
                addonScope={match.tier.label}
                addonScopeId={match.scopeId}
              />
              <PriceCell
                label={t(outputLabel)}
                value={priceValue(match.tier.prices, outputVariable)}
                currency={props.currency}
                onChange={(value) => update(outputVariable, value)}
                addonKey={outputVariable}
                addonScope={match.tier.label}
                addonScopeId={match.scopeId}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GeminiCachePricingEditor({
  kind,
  ...props
}: PlatformVisualBillingDocumentEditorProps & {
  kind: GeminiCachePricingKind
}) {
  const { t } = useTranslation()
  const match = findGeminiCachePricingTier(props.document.root, kind)
  if (!match) return null

  const isUnified = kind === 'unified'
  const update = (variables: VisualPrice['variable'][], value: string) =>
    props.onChange({
      ...props.document,
      root: updateGeminiCachePricingTier(props.document.root, kind, variables, value),
    })
  const inputVariables: VisualPrice['variable'][] = isUnified
    ? ['p', 'img', 'vid', 'ai']
    : ['p', 'img', 'vid']
  const inputLabel = isUnified
    ? 'Text/image/video/audio input'
    : 'Text/image/video input'
  const inputHint = isUnified
    ? 'One price is applied to text, image, video, and audio input tokens.'
    : 'One price is applied to text, image, and video input tokens.'

  const fields: Array<{
    label: string
    variable: VisualPrice['variable']
    variables?: VisualPrice['variable'][]
    hint?: string
  }> = [
    { label: inputLabel, variable: 'p', variables: inputVariables, hint: inputHint },
  ]
  if (!isUnified) {
    fields.push({ label: 'Audio input', variable: 'ai' })
  }
  fields.push({ label: 'Cached input', variable: 'cr' })
  if (!isUnified) {
    fields.push({ label: 'Audio cached input', variable: 'ai_cr' })
  }
  fields.push({ label: 'Output', variable: 'c' })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>
          {t(
            isUnified
              ? 'Gemini Flash Lite unified multimodal + cached input pricing'
              : 'Gemini Flash Lite shared text/image/video + separate audio/cache pricing'
          )}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t(
            isUnified
              ? 'Fill the shared input, cached input, and output prices directly.'
              : 'Fill shared text/image/video input, audio input, cached input, audio cached input, and output prices directly.'
          )}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[760px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th colSpan={isUnified ? 1 : 2} className='border-b border-r p-2 text-center font-medium'>
                {t('Input unit price')}
              </th>
              <th colSpan={isUnified ? 1 : 2} className='border-b border-r p-2 text-center font-medium'>
                {t('Cached input price')}
              </th>
              <th className='border-b p-2 text-center font-medium'>{t('Output unit price')}</th>
            </tr>
            <tr>
              {fields.map((field) => (
                <th key={field.variable} className='border-r p-2 text-left font-medium last:border-r-0'>
                  {t(field.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              {fields.map((field) => (
                <PriceCell
                  key={field.variable}
                  label={t(field.label)}
                  value={priceValue(match.tier.prices, field.variable)}
                  currency={props.currency}
                  onChange={(value) => update(field.variables || [field.variable], value)}
                  hint={field.hint ? t(field.hint) : undefined}
                  addonKey={field.variable}
                  addonScope={match.tier.label}
                  addonScopeId={match.scopeId}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SimpleModalityPricingEditor({
  config,
  ...props
}: PlatformVisualBillingDocumentEditorProps & {
  config: SimpleModalityPricingConfig
}) {
  const { t } = useTranslation()
  const match = findSimpleModalityPricingTier(props.document.root, config)
  if (!match) return null

  const update = (variables: VisualPrice['variable'][], value: string) =>
    props.onChange({
      ...props.document,
      root: updateSimpleModalityPricingTier(
        props.document.root,
        config,
        variables,
        value
      ),
    })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>{t(config.title)}</p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t(config.description)}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[680px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              {config.fields.map((field) => (
                <th
                  key={field.variable}
                  className='border-r p-2 text-left font-medium last:border-r-0'
                >
                  {t(field.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              {config.fields.map((field) => (
                <PriceCell
                  key={field.variable}
                  label={t(field.label)}
                  value={priceValue(match.tier.prices, field.variable)}
                  currency={props.currency}
                  onChange={(value) =>
                    update(field.variables || [field.variable], value)
                  }
                  hint={field.hint ? t(field.hint) : undefined}
                  addonKey={field.variable}
                  addonScope={match.tier.label}
                  addonScopeId={match.scopeId}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TextAudioInputOutputEditor(
  props: PlatformVisualBillingDocumentEditorProps
) {
  const { t } = useTranslation()
  const match = findTextAudioInputOutputTier(props.document.root)
  if (!match) return null

  const update = (variable: VisualPrice['variable'], value: string) =>
    props.onChange({
      ...props.document,
      root: updateTextAudioInputOutputTier(props.document.root, variable, value),
    })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>
          {t('Simple text/audio input + text/audio output pricing')}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('Fill four prices directly: text input, audio input, text output, and audio output.')}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[760px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th colSpan={2} className='border-b border-r p-2 text-center font-medium'>
                {t('Input unit price')}
              </th>
              <th colSpan={2} className='border-b p-2 text-center font-medium'>
                {t('Output unit price')}
              </th>
            </tr>
            <tr>
              <th className='border-r p-2 text-left font-medium'>{t('Text input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Audio input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Text output')}</th>
              <th className='p-2 text-left font-medium'>{t('Audio output')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              {([
                ['p', 'Text input'],
                ['ai', 'Audio input'],
                ['c', 'Text output'],
                ['ao', 'Audio output'],
              ] as const).map(([variable, label]) => (
                <PriceCell
                  key={variable}
                  label={t(label)}
                  value={priceValue(match.tier.prices, variable)}
                  currency={props.currency}
                  onChange={(value) => update(variable, value)}
                  addonKey={variable}
                  addonScope={match.tier.label}
                  addonScopeId={match.scopeId}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AudioImageInputOutputEditor(
  props: PlatformVisualBillingDocumentEditorProps
) {
  const { t } = useTranslation()
  const match = findAudioImageInputOutputTier(props.document.root)
  if (!match) return null

  const update = (variable: VisualPrice['variable'], value: string) =>
    props.onChange({
      ...props.document,
      root: updateAudioImageInputOutputTier(props.document.root, variable, value),
    })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>
          {t('Audio/image input + text/audio output pricing')}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('Fill four prices directly: audio input, image input, text output, and audio output.')}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[760px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th colSpan={2} className='border-b border-r p-2 text-center font-medium'>
                {t('Input unit price')}
              </th>
              <th colSpan={2} className='border-b p-2 text-center font-medium'>
                {t('Output unit price')}
              </th>
            </tr>
            <tr>
              <th className='border-r p-2 text-left font-medium'>{t('Audio input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Image input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Text output')}</th>
              <th className='p-2 text-left font-medium'>{t('Audio output')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              {([
                ['ai', 'Audio input'],
                ['img', 'Image input'],
                ['c', 'Text output'],
                ['ao', 'Audio output'],
              ] as const).map(([variable, label]) => (
                <PriceCell
                  key={variable}
                  label={t(label)}
                  value={priceValue(match.tier.prices, variable)}
                  currency={props.currency}
                  onChange={(value) => update(variable, value)}
                  addonKey={variable}
                  addonScope={match.tier.label}
                  addonScopeId={match.scopeId}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function PlatformVisualBillingDocumentEditor(
  props: PlatformVisualBillingDocumentEditorProps
) {
  if (supportsGeminiCachePricingEditor(props.document, 'unified')) {
    return <GeminiCachePricingEditor {...props} kind='unified' />
  }
  if (supportsGeminiCachePricingEditor(props.document, 'audio-split')) {
    return <GeminiCachePricingEditor {...props} kind='audio-split' />
  }
  const simpleConfig = simpleModalityPricingConfig(props.document)
  if (simpleConfig) {
    return <SimpleModalityPricingEditor {...props} config={simpleConfig} />
  }
  if (supportsAudioTokenOutputEditor(props.document, 'audio')) {
    return <AudioTokenOutputEditor {...props} kind='audio' />
  }
  if (supportsAudioTokenOutputEditor(props.document, 'text')) {
    return <AudioTokenOutputEditor {...props} kind='text' />
  }
  if (supportsTextAudioInputOutputEditor(props.document)) {
    return <TextAudioInputOutputEditor {...props} />
  }
  if (supportsAudioImageInputOutputEditor(props.document)) {
    return <AudioImageInputOutputEditor {...props} />
  }
  if (supportsSharedTextImageAudioOutputEditor(props.document)) {
    return <SharedTextImageAudioOutputEditor {...props} />
  }
  const { t } = useTranslation()
  const shared = props.document.shared
  const tiers = collectOmniTiers(props.document.root)
  if (!shared || tiers.size !== 3) return null

  const updateShared = (
    variables: VisualPrice['variable'][],
    value: string
  ) =>
    props.onChange({
      ...props.document,
      shared: {
        ...shared,
        prices: updatePrices(shared.prices, variables, value),
      },
    })
  const updateOutput = (
    kind: OmniOutputKind,
    variable: VisualPrice['variable'],
    value: string
  ) =>
    props.onChange({
      ...props.document,
      root: updateOmniTier(props.document.root, kind, variable, value),
    })

  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div>
        <p className='text-sm font-medium'>
          {t('Qwen3 Omni shared image/video input + three output prices')}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('One price is applied to both image and video input tokens.')}
        </p>
      </div>
      <div className='overflow-x-auto rounded-md border bg-background'>
        <table className='min-w-[960px] table-fixed text-sm'>
          <thead className='bg-muted/60 text-xs text-muted-foreground'>
            <tr>
              <th colSpan={3} className='border-b border-r p-2 text-center font-medium'>
                {t('Input unit price')}
              </th>
              <th colSpan={3} className='border-b p-2 text-center font-medium'>
                {t('Output unit price')}
              </th>
            </tr>
            <tr>
              <th className='border-r p-2 text-left font-medium'>{t('Text input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Audio input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Image / video input')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Pure text output')}</th>
              <th className='border-r p-2 text-left font-medium'>{t('Multimodal text output')}</th>
              <th className='p-2 text-left font-medium'>
                {t('Text + audio output')}
                <span className='ml-1 font-normal'>({t('Audio only billed')})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className='border-t'>
              <PriceCell
                label={t('Text input')}
                value={priceValue(shared.prices, 'p')}
                currency={props.currency}
                onChange={(value) => updateShared(['p'], value)}
                addonKey='p'
                addonScopeId='shared'
              />
              <PriceCell
                label={t('Audio input')}
                value={priceValue(shared.prices, 'ai')}
                currency={props.currency}
                onChange={(value) => updateShared(['ai'], value)}
                addonKey='ai'
                addonScopeId='shared'
              />
              <PriceCell
                label={t('Image / video input')}
                value={priceValue(shared.prices, 'img')}
                currency={props.currency}
                onChange={(value) => updateShared(['img', 'vid'], value)}
                hint={t('One price is applied to both image and video input tokens.')}
                addonKey='img'
                addonScopeId='shared'
              />
              <PriceCell
                label={t('Pure text output')}
                value={priceValue(tiers.get('pure')?.tier.prices, 'c')}
                currency={props.currency}
                onChange={(value) => updateOutput('pure', 'c', value)}
                addonKey='c'
                addonScope={tiers.get('pure')?.tier.label}
                addonScopeId={tiers.get('pure')?.scopeId}
              />
              <PriceCell
                label={t('Multimodal text output')}
                value={priceValue(tiers.get('multimodal')?.tier.prices, 'c')}
                currency={props.currency}
                onChange={(value) => updateOutput('multimodal', 'c', value)}
                addonKey='c'
                addonScope={tiers.get('multimodal')?.tier.label}
                addonScopeId={tiers.get('multimodal')?.scopeId}
              />
              <PriceCell
                label={t('Text + audio output')}
                value={priceValue(tiers.get('audio')?.tier.prices, 'ao')}
                currency={props.currency}
                onChange={(value) => updateOutput('audio', 'ao', value)}
                addonKey='ao'
                addonScope={tiers.get('audio')?.tier.label}
                addonScopeId={tiers.get('audio')?.scopeId}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
