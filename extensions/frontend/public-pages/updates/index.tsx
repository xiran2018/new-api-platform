import DOMPurify from 'dompurify'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { api } from '@/lib/api'

type Update = { id: number; title: string; icon: string; bodyHtml: string; publishedAt: string }

export function UpdatesPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Update[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => { void api.get('/api/platform/public/updates').then((r) => setItems(r.data.data ?? [])) }, [])
  const visible = items.filter((item) => `${item.title} ${item.bodyHtml}`.toLowerCase().includes(search.toLowerCase()))
  return <PublicLayout showMainContainer={false}><div className='mx-auto max-w-5xl px-5 pt-24 pb-10 text-foreground'>
    <header className='mb-5 text-center'><h1 className='text-4xl font-bold'>LLMAPI {t('Changelog')}</h1><p className='mt-3 rounded bg-[#f0f4ff] p-2 text-sm'>{t('We are continually improving our service.')}</p><input className='mt-5 w-full rounded-full border px-4 py-2' placeholder={t('Search updates...')} value={search} onChange={(e) => setSearch(e.target.value)} /></header>
    <div className='text-lg font-bold'><span className='rounded bg-[#d8e9ff] px-3 py-2'>📢 {t('Changelog')}</span></div>
    <section className='mt-6 space-y-5'>{visible.map((item) => <article key={item.id} className='flex gap-5 max-md:flex-col'><time className='min-w-28 font-semibold text-[#17a2b8]'>📅 {new Date(item.publishedAt).toLocaleDateString()}</time><div style={{ backgroundColor: '#ffffff', color: '#172033' }} className='w-full rounded p-4 shadow'><h2 style={{ color: '#172033' }} className='mb-3 text-sm font-semibold'>{item.icon} {item.title}</h2><div style={{ color: '#26354a' }} className='max-w-none [&_a]:!text-blue-700 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:list-decimal [&_ol]:pl-7 [&_li]:my-1' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.bodyHtml) }} /></div></article>)}</section>
  </div></PublicLayout>
}
