import { createContext, useContext, type ReactNode } from "react";

export type PricingFieldAddonInput = {
  key: string;
  scope?: string;
  value: string;
};

export type PricingFieldAddonRenderer = (
  field: PricingFieldAddonInput,
) => ReactNode;

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

export function PricingFieldAddon(props: PricingFieldAddonInput) {
  const render = useContext(PricingFieldAddonContext);
  return render?.(props) ?? null;
}
