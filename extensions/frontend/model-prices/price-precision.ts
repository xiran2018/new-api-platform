import type { UsageRuleSet } from "./types";

export const DEFAULT_PRICE_FRACTION_DIGITS = 3;
export const AUDIO_DURATION_PRICE_FRACTION_DIGITS = 6;


export function isAudioDurationPriceField(field: string) {
  return field === "audioDuration" || field === "aud_s";
}

/**
 * A plain `seconds` meter is also used by video templates. Audio duration
 * rules are the seconds-based rules without video resolution/mode switches.
 */
export function isAudioDurationUsageRuleSet(ruleSet?: UsageRuleSet) {
  if (!ruleSet?.rules?.length) return false;
  const conditionFields = new Set(
    ruleSet.rules.flatMap((rule) =>
      rule.conditions.map((condition) => condition.field),
    ),
  );
  const hasSecondsCharge = ruleSet.rules.some((rule) =>
    rule.charges.some((charge) => charge.meter === "seconds"),
  );
  return hasSecondsCharge &&
    !["resolution", "resolution_tier", "mode", "audio"].some((field) =>
      conditionFields.has(field),
    );
}

export function priceFractionDigits(audioDuration: boolean) {
  return audioDuration
    ? AUDIO_DURATION_PRICE_FRACTION_DIGITS
    : DEFAULT_PRICE_FRACTION_DIGITS;
}

export function formatPriceDecimal(value: number, fractionDigits: number) {
  const zeroThreshold = 0.5 * 10 ** -fractionDigits;
  const displayValue = Math.abs(value) < zeroThreshold ? 0 : value;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Math.min(
      DEFAULT_PRICE_FRACTION_DIGITS,
      fractionDigits,
    ),
    maximumFractionDigits: fractionDigits,
  }).format(displayValue);
}
