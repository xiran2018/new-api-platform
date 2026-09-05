import { createFileRoute } from '@tanstack/react-router'

import { ContentManagementPage } from '@/platform/admin-pages/content'

export const Route = createFileRoute('/_authenticated/platform/content/')({
  component: ContentManagementPage,
})
