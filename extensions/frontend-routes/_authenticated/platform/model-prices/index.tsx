import { createFileRoute } from "@tanstack/react-router";
import { ModelPriceManagementPage } from "@/platform/admin-pages/model-prices";
export const Route = createFileRoute("/_authenticated/platform/model-prices/")({
  component: ModelPriceManagementPage,
});
