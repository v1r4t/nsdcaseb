import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

/** Only these schemes are offered to the composer; the worker enforces the same. */
const LINK_PROTOCOLS = ['http', 'https', 'mailto'];

function isAllowedHref(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return LINK_PROTOCOLS.includes(parsed.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

export interface RichTextValue {
  html: string;
  text: string;
}

export interface RichTextEditorProps {
  /** Accessible name for the editable region. */
  label?: string;
  placeholder?: string;
  /** Called on every edit with the schema-filtered HTML and its text mirror. */
  onChange: (value: RichTextValue) => void;
  /** Change this number to clear the editor (e.g. after a successful send). */
  resetSignal?: number;
  /** Reports a rejected link so the parent can surface it. */
  onInvalidLink?: (message: string) => void;
}

interface ToolButton {
  label: string;
  text: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function RichTextEditor({
  label = 'Message body',
  placeholder = 'Write your message…',
  onChange,
  resetSignal,
  onInvalidLink,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [html, setHtml] = useState('');
  const [isEmpty, setIsEmpty] = useState(true);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const invalidLinkRef = useRef(onInvalidLink);
  useEffect(() => {
    invalidLinkRef.current = onInvalidLink;
  }, [onInvalidLink]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Link ships with StarterKit in v3; disable the bundled copy and
      // register the explicitly configured one.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: LINK_PROTOCOLS,
        isAllowedUri: (url) => isAllowedHref(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'rte-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
      },
    },
    onCreate({ editor: instance }) {
      setIsEmpty(instance.isEmpty);
    },
    onUpdate({ editor: instance }) {
      const nextHtml = instance.getHTML();
      setHtml(nextHtml);
      setIsEmpty(instance.isEmpty);
      onChangeRef.current({
        html: nextHtml,
        text: instance.getText({ blockSeparator: '\n\n' }),
      });
    },
  });

  // Clearing from the parent: the editor owns its content, so a signal is
  // easier to reason about than binding `value` to every keystroke.
  useEffect(() => {
    if (!editor) return;
    editor.commands.clearContent(true);
    setHtml('');
    setIsEmpty(true);
    onChangeRef.current({ html: '', text: '' });
  }, [editor, resetSignal]);

  function setLink(): void {
    if (!editor) return;
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const input = window.prompt('Link URL (http://, https:// or mailto:)', previous || 'https://');
    if (input === null) return;
    const url = input.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    if (!isAllowedHref(candidate)) {
      invalidLinkRef.current?.('Links must start with http://, https:// or mailto:.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: candidate }).run();
  }

  if (!editor) {
    return <div className="field" aria-busy="true" />;
  }

  const tools: ToolButton[] = [
    {
      label: 'Bold',
      text: 'B',
      active: editor.isActive('bold'),
      disabled: !editor.can().chain().focus().toggleBold().run(),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      text: 'I',
      active: editor.isActive('italic'),
      disabled: !editor.can().chain().focus().toggleItalic().run(),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Heading',
      text: 'H2',
      active: editor.isActive('heading', { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Bulleted list',
      text: '• List',
      active: editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      text: '1. List',
      active: editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Link',
      text: 'Link',
      active: editor.isActive('link'),
      onClick: setLink,
    },
    {
      label: 'Undo',
      text: '↶',
      disabled: !editor.can().chain().focus().undo().run(),
      onClick: () => editor.chain().focus().undo().run(),
    },
    {
      label: 'Redo',
      text: '↷',
      disabled: !editor.can().chain().focus().redo().run(),
      onClick: () => editor.chain().focus().redo().run(),
    },
    {
      label: 'Clear formatting',
      text: 'Tx',
      onClick: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Formatting">
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              aria-label={tool.label}
              aria-pressed={tool.active === undefined ? undefined : tool.active}
              className={tool.active ? 'btn-primary px-2.5 py-1.5 text-xs' : 'btn-ghost px-2.5 py-1.5 text-xs'}
              disabled={tool.disabled}
              onClick={tool.onClick}
            >
              {tool.text}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Editor mode">
          <button
            type="button"
            aria-pressed={mode === 'write'}
            className={mode === 'write' ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-ghost px-3 py-1.5 text-xs'}
            onClick={() => setMode('write')}
          >
            Write
          </button>
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            className={mode === 'preview' ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-ghost px-3 py-1.5 text-xs'}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <div className="relative">
          {isEmpty && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted"
            >
              {placeholder}
            </span>
          )}
          <EditorContent editor={editor} />
        </div>
      ) : (
        <div className="rte-content">
          {isEmpty ? (
            <p className="text-muted">{placeholder}</p>
          ) : (
            // TipTap's schema is the filter here: pasted scripts/iframes never
            // enter the document, and the worker sanitises this HTML again.
            <div dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      )}
      <p className="hint">Formatting is sent as HTML with a plain-text fallback.</p>
    </div>
  );
}
