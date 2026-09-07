import type { TopNavLink } from '@/components/layout/types'
import { api } from '@/lib/api'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '../i18n/invoice-translations'
import '../i18n/model-price-translations'

export type PlatformNavItem = {
  id: string
  title: string
  href: string
  order: number
  requiresAuth?: boolean
}

// The core navigation seam imports this registry after assembly.
export const platformPublicNav: PlatformNavItem[] = [
  { id: 'model-prices', title: 'Model prices', href: '/model-prices', order: 60 },
  { id: 'updates', title: 'Changelog', href: '/updates', order: 75 },
  { id: 'faq', title: 'FAQ', href: '/faq', order: 70 },
]

export const platformAdminNav: PlatformNavItem[] = [
  { id: 'model-price-management', title: 'Model price management', href: '/platform/model-prices', order: 69, requiresAuth: true },
  {
    id: 'content-management',
    title: 'Content management',
    href: '/platform/content',
    order: 70,
    requiresAuth: true,
  },
  { id: 'faq-management', title: 'FAQ management', href: '/platform/faq-management', order: 71, requiresAuth: true },
  { id: 'invoice-management', title: 'Invoice management', href: '/invoice-management', order: 72, requiresAuth: true },
]

export const platformUserNav: PlatformNavItem[] = [
  { id: 'invoice', title: 'Invoice', href: '/invoice', order: 10, requiresAuth: true },
]

export function getPlatformPublicTopNavLinks(): TopNavLink[] {
  return [...platformPublicNav]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      title: item.title,
      href: item.href,
      requiresAuth: item.requiresAuth,
    }))
}

export function usePlatformPublicTopNavLinks(): TopNavLink[] {
  const { t } = useTranslation()
  const [updatesEnabled, setUpdatesEnabled] = useState(true)

  useEffect(() => {
    void api
      .get('/api/platform/public/updates/settings')
      .then((response) => setUpdatesEnabled(response.data?.data?.enabled === true))
      .catch(() => setUpdatesEnabled(false))
  }, [])

  return getPlatformPublicTopNavLinks()
    .filter((link) => link.href !== '/updates' || updatesEnabled)
    .map((link) => ({ ...link, title: t(link.title) }))
}
