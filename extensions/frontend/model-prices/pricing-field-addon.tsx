import { createContext, useContext, type ReactNode } from "react";

export type PricingFieldAddonInput = {
  key: string;
  scope?: string;
  /** Stable structural position of the field inside a visual pricing tree. */
  scopeId?: string;
  value: string;
};

export type PricingFieldAddonRenderer = (
  field: PricingFieldAddonInput,
) => ReactNode;

type PricingFieldAddonProps = Omit<PricingFieldAddonInput, "key"> & {
  /** Do not use React's reserved `key` prop: React does not pass it through. */
  fieldKey: string;
};

const PricingFieldAddonContext = createContext<
  PricingFieldAddonRenderer | undefined
>(undefined);

export function PricingFieldAddonProvider(props: {
  children: ReactNode;
  renderer?: PricingFieldAddonRenderer;
}) {
  return (
    <PricingFieldAddonContext.Provider value={props.renderer}>
      {props.children}
    </PricingFieldAddonContext.Provider>
  );
}

export function PricingFieldAddon({ fieldKey, ...props }: PricingFieldAddonProps) {
  const render = useContext(PricingFieldAddonContext);
  return render?.({ key: fieldKey, ...props }) ?? null;
}
