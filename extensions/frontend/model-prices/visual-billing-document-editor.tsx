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

const SHARED_MEDIA_MARKER = 'shared image/video input'
const SHARED_TEXT_IMAGE_VIDEO_MARKER = 'shared text/image/video input'
const SHARED_TEXT_IMAGE_MARKER = 'shared text/image input'
const AUDIO_IMAGE_INPUT_OUTPUT_MARKER = 'audio/image input + text/audio output'

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
    supportsSharedTextImageAudioOutputEditor(document) ||
    supportsAudioImageInputOutputEditor(document)
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
