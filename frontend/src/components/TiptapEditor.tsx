import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { TableFormula } from '../extensions/tableFormula';
import './TiptapEditor.less';

const lowlight = createLowlight(common);

interface TiptapEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  onChange,
  placeholder = '',
  editable = true,
}) => {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const lastContentRef = useRef<string>(content);
  const isInternalChangeRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Placeholder.configure({ placeholder }),
      Color,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
      TableFormula,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      isInternalChangeRef.current = true;
      const md = editor.storage.markdown.getMarkdown();
      lastContentRef.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor || isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    if (content !== lastContentRef.current) {
      lastContentRef.current = content;
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    if (!sourceMode) {
      const md = editor.storage.markdown.getMarkdown();
      setSourceText(md);
      setSourceMode(true);
    } else {
      lastContentRef.current = sourceText;
      editor.commands.setContent(sourceText);
      onChange(sourceText);
      setSourceMode(false);
    }
  }, [editor, sourceMode, sourceText, onChange]);

  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSourceText(e.target.value);
    onChange(e.target.value);
  }, [onChange]);

  if (!editor) return null;

  return (
    <div className="tiptap-editor-wrapper">
      <div className="tiptap-mode-toggle">
        <button
          type="button"
          onClick={toggleSourceMode}
          className={sourceMode ? 'is-active' : ''}
          title={sourceMode ? '切换到预览模式' : '切换到源码模式'}
        >
          {sourceMode ? '预览' : '源码'}
        </button>
      </div>

      {sourceMode ? (
        <textarea
          className="tiptap-source-editor"
          value={sourceText}
          onChange={handleSourceChange}
          spellCheck={false}
        />
      ) : (
      <>
      <BubbleMenu
        editor={editor}
        tippyOptions={{
          placement: 'top',
          popperOptions: {
            modifiers: [
              { name: 'flip' },
              { name: 'preventOverflow', options: { boundary: 'viewport' } },
            ],
          },
        }}
        className="tiptap-bubble-menu"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="粗体"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="斜体"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'is-active' : ''}
          title="下划线"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'is-active' : ''}
          title="删除线"
        >
          <s>S</s>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={editor.isActive('code') ? 'is-active' : ''}
          title="行内代码"
        >
          {'</>'}
        </button>
        <button
          type="button"
          onClick={setLink}
          className={editor.isActive('link') ? 'is-active' : ''}
          title="链接"
        >
          🔗
        </button>
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        tippyOptions={{
          placement: 'bottom-start',
          popperOptions: {
            modifiers: [
              { name: 'flip' },
              { name: 'preventOverflow', options: { boundary: 'viewport' } },
            ],
          },
        }}
        className="tiptap-floating-menu"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
        >
          ☰
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
        >
          1.
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={editor.isActive('taskList') ? 'is-active' : ''}
        >
          ☑
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
        >
          ❝
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor.isActive('codeBlock') ? 'is-active' : ''}
        >
          {'</>'}
        </button>
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          ⊞
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          ―
        </button>
      </FloatingMenu>

      <EditorContent editor={editor} className="tiptap-editor-content" />
      </>
      )}
    </div>
  );
};

export default TiptapEditor;
