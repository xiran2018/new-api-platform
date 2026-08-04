import Link from '@tiptap/extension-link'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type RichTextEditorProps = { value: string; onChange: (value: string) => void }

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() { return [{ types: ['textStyle'], attributes: { fontSize: { default: null, parseHTML: (element) => element.style.fontSize, renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {} } } }] },
})

function ToolButton(props: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type='button' title={props.label} aria-label={props.label} onMouseDown={(event) => { event.preventDefault(); props.onClick() }} className={`rounded p-2 transition-colors hover:bg-muted ${props.active ? 'bg-muted text-primary' : ''}`}>{props.children}</button>
}

export function RichTextEditor(props: RichTextEditorProps) {
  const { t } = useTranslation()
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, FontSize, Link.configure({ openOnClick: false, autolink: true })],
    content: props.value,
    onUpdate: ({ editor: currentEditor }) => props.onChange(currentEditor.getHTML()),
    editorProps: { attributes: { class: 'prose prose-sm dark:prose-invert min-h-64 max-w-none p-4 outline-none [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:list-decimal [&_ol]:pl-7 [&_li]:my-1' } },
  })

  useEffect(() => { if (editor && props.value !== editor.getHTML()) editor.commands.setContent(props.value, { emitUpdate: false }) }, [editor, props.value])
  if (!editor) return null
  const addLink = () => { const url = window.prompt(t('Link URL')); if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run() }
  return <div className='overflow-hidden rounded-lg border bg-background shadow-sm'><div className='flex flex-wrap gap-1 border-b bg-muted/40 p-2'>
    <ToolButton label={t('Undo')} onClick={() => editor.chain().focus().undo().run()}><Undo2 className='size-4'/></ToolButton><ToolButton label={t('Redo')} onClick={() => editor.chain().focus().redo().run()}><Redo2 className='size-4'/></ToolButton>
    <span className='mx-1 w-px bg-border'/><ToolButton label={t('Heading 1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className='size-4'/></ToolButton><ToolButton label={t('Heading 2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className='size-4'/></ToolButton>
    <ToolButton label={t('Bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className='size-4'/></ToolButton><ToolButton label={t('Italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className='size-4'/></ToolButton><ToolButton label={t('Strike')} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className='size-4'/></ToolButton>
    <input type='color' title={t('Text color')} value={editor.getAttributes('textStyle').color ?? '#000000'} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} className='size-9 cursor-pointer rounded border p-1' />
    <select aria-label={t('Font size')} value={editor.getAttributes('textStyle').fontSize ?? ''} onChange={(event) => editor.chain().focus().setMark('textStyle', { fontSize: event.target.value || null }).run()} className='h-9 rounded border bg-background px-2 text-sm'><option value=''>{t('Font size')}</option><option value='14px'>14px</option><option value='16px'>16px</option><option value='18px'>18px</option><option value='20px'>20px</option><option value='24px'>24px</option><option value='30px'>30px</option></select>
    <ToolButton label={t('Bulleted list')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className='size-4'/></ToolButton><ToolButton label={t('Ordered list')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className='size-4'/></ToolButton><ToolButton label={t('Quote')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className='size-4'/></ToolButton><ToolButton label={t('Code block')} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 className='size-4'/></ToolButton>
    <ToolButton label={t('Link')} active={editor.isActive('link')} onClick={addLink}><LinkIcon className='size-4'/></ToolButton>
  </div><EditorContent editor={editor} className='max-h-[72vh] min-h-[44rem] overflow-y-auto'/></div>
}
