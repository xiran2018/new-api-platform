import { Maximize2, Minimize2, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

import { RichTextEditor } from '../../components/rich-text-editor'

type Update = { id: number; title: string; icon: string; bodyHtml: string; published: boolean; publishedAt: string; sortOrder: number }

export function ContentManagementPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Update[]>([])
  const [enabled, setEnabled] = useState(true)
  const [editing, setEditing] = useState<Update | null>(null)
  const [maximized, setMaximized] = useState(false)
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 })
  const load = () => { void Promise.all([api.get('/api/platform/admin/updates'), api.get('/api/platform/admin/updates/settings')]).then(([updates, settings]) => { setItems(updates.data.data ?? []); setEnabled(settings.data.data.enabled) }) }
  useEffect(load, [])
  const save = async () => { if (!editing) return; if (editing.id) await api.put(`/api/platform/admin/updates/${editing.id}`, editing); else await api.post('/api/platform/admin/updates', editing); setEditing(null); load() }
  const remove = async (item: Update) => { if (!window.confirm(t('Delete this update?'))) return; await api.delete(`/api/platform/admin/updates/${item.id}`); load() }

  return <div className='space-y-5 p-6'><div className='flex items-center justify-between'><h1 className='text-2xl font-semibold'>{t('Updates management')}</h1><label className='flex gap-2'><input type='checkbox' checked={enabled} onChange={async (e) => { setEnabled(e.target.checked); await api.put('/api/platform/admin/updates/settings', { enabled: e.target.checked }) }} />{t('Show updates page')}</label></div>
    <button className='rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm' onClick={() => setEditing({ id: 0, title: '', icon: '🚀', bodyHtml: '', published: true, publishedAt: new Date().toISOString(), sortOrder: 0 })}>{t('Add update')}</button>
    <table className='w-full overflow-hidden rounded-lg border text-left'><thead className='bg-muted/60'><tr><th className='p-3'>{t('Date')}</th><th>{t('Title')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className='border-t'><td className='p-3'>{new Date(item.publishedAt).toLocaleDateString()}</td><td>{item.icon} {item.title}</td><td>{item.published ? t('Published') : t('Hidden')}</td><td className='space-x-3'><button className='text-primary hover:underline' onClick={() => setEditing(item)}>{t('Edit')}</button><button className='inline-flex items-center gap-1 text-destructive hover:underline' onClick={() => remove(item)}><Trash2 className='size-4' />{t('Delete')}</button></td></tr>)}</tbody></table>
    {editing && <div className='fixed inset-0 z-50 overflow-hidden bg-black/50 p-6'><div style={maximized ? undefined : { transform: `translate(${dialogPosition.x}px, ${dialogPosition.y}px)` }} className={`space-y-4 rounded-xl bg-background p-6 shadow-xl ${maximized ? 'h-full w-full overflow-auto' : 'mx-auto max-w-5xl'}`}><div className='flex cursor-move items-center justify-between border-b pb-3' onPointerDown={(event) => { if (maximized) return; const startX = event.clientX; const startY = event.clientY; const origin = dialogPosition; const move = (moveEvent: PointerEvent) => setDialogPosition({ x: origin.x + moveEvent.clientX - startX, y: origin.y + moveEvent.clientY - startY }); const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }; document.addEventListener('pointermove', move); document.addEventListener('pointerup', up) }}><h2 className='text-lg font-semibold'>{editing.id ? t('Edit update') : t('Add update')}</h2><div className='flex gap-2'><button onClick={() => setMaximized(!maximized)} aria-label={maximized ? t('Restore') : t('Maximize')}>{maximized ? <Minimize2 /> : <Maximize2 />}</button><button onClick={() => setEditing(null)} aria-label={t('Cancel')}><X /></button></div></div><input className='w-full rounded-md border p-2.5' value={editing.title} placeholder={t('Title')} onChange={(e) => setEditing({ ...editing, title: e.target.value })}/><RichTextEditor value={editing.bodyHtml} onChange={(bodyHtml) => setEditing({ ...editing, bodyHtml })}/><label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })}/>{t('Published')}</label><div className='flex justify-end gap-3 border-t pt-4'><button className='rounded-md border px-4 py-2 hover:bg-muted' onClick={() => setEditing(null)}>{t('Cancel')}</button><button className='rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground shadow-sm' onClick={save}>{t('Save')}</button></div></div></div>}
  </div>
}
