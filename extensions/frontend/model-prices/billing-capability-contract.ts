/** Stable product capabilities. Implementations and expression syntax may change,
 * but each capability must remain represented by a supported template/editor. */
export const BILLING_CAPABILITY_CONTRACT = [
  'token-pricing',
  'request-pricing',
  'expression-pricing',
  'advanced-media-pricing',
  'shared-input-output-branches',
  'input-length-tiers',
  'thinking-parameter-branches',
  'audio-duration-pricing',
  'video-output-pricing',
] as const

export type BillingCapability = (typeof BILLING_CAPABILITY_CONTRACT)[number]
