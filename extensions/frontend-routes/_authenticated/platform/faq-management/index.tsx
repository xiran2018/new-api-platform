import { createFileRoute } from '@tanstack/react-router'

import { FaqManagementPage } from '@/platform/admin-pages/faq'

export const Route = createFileRoute(
  '/_authenticated/platform/faq-management/',
)({ component: FaqManagementPage })
