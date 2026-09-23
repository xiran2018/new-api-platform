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

export type PlatformVisualBillingDocumentEditorProps = {
  document: VisualBillingDocument
  currency: PricingCurrency
  issues: VisualBillingIssue[]
  onChange: (document: VisualBillingDocument) => void
}

type OmniOutputKind = 'pure' | 'multimodal' | 'audio'

const SHARED_MEDIA_MARKER = 'shared image/video input'

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
  result = new Map<OmniOutputKind, Extract<VisualPricingNode, { kind: 'tier' }>>()
) {
  if (node.kind === 'branch') {
    collectOmniTiers(node.yes, result)
    collectOmniTiers(node.no, result)
    return result
  }
  const kind = omniOutputKind(node.label)
  if (kind) result.set(kind, node)
  return result
}

export function supportsPlatformVisualBillingDocumentEditor(
  document: VisualBillingDocument
) {
  const sharedVariables = new Set(
    document.shared?.prices.map((price) => price.variable) || []
  )
  const tiers = collectOmniTiers(document.root)
  return (
    ['p', 'ai', 'img', 'vid'].every((variable) =>
      sharedVariables.has(variable as VisualPrice['variable'])
    ) &&
    tiers.has('pure') &&
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

function PriceCell({
  label,
  value,
  currency,
  onChange,
  hint,
}: {
  label: string
  value: string
  currency: PricingCurrency
  onChange: (value: string) => void
  hint?: string
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
    </td>
  )
}

export function PlatformVisualBillingDocumentEditor(
  props: PlatformVisualBillingDocumentEditorProps
) {
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
              />
              <PriceCell
                label={t('Audio input')}
                value={priceValue(shared.prices, 'ai')}
                currency={props.currency}
                onChange={(value) => updateShared(['ai'], value)}
              />
              <PriceCell
                label={t('Image / video input')}
                value={priceValue(shared.prices, 'img')}
                currency={props.currency}
                onChange={(value) => updateShared(['img', 'vid'], value)}
                hint={t('One price is applied to both image and video input tokens.')}
              />
              <PriceCell
                label={t('Pure text output')}
                value={priceValue(tiers.get('pure')?.prices, 'c')}
                currency={props.currency}
                onChange={(value) => updateOutput('pure', 'c', value)}
              />
              <PriceCell
                label={t('Multimodal text output')}
                value={priceValue(tiers.get('multimodal')?.prices, 'c')}
                currency={props.currency}
                onChange={(value) => updateOutput('multimodal', 'c', value)}
              />
              <PriceCell
                label={t('Text + audio output')}
                value={priceValue(tiers.get('audio')?.prices, 'ao')}
                currency={props.currency}
                onChange={(value) => updateOutput('audio', 'ao', value)}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
