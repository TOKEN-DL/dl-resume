/**
 * TipTap 富文本编辑器 — F5 + F6/F7/F8 描述字段共用.
 *
 * 简化: StarterKit + Link,工具栏只有 加粗/斜体/列表/链接.
 * 输出 HTML 字符串(由 caller 持久化).
 */
"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect, useRef } from "react";
import styles from "./tiptap.module.css";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function TiptapEditor({ value, onChange, placeholder, minHeight = 80 }: Props) {
  return (
    <TiptapInner
      key={placeholder ?? "default"}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      minHeight={minHeight}
    />
  );
}

function TiptapInner({ value, onChange, placeholder, minHeight }: Props) {
  const lastEmittedRef = useRef(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: styles.editor,
        "data-placeholder": placeholder ?? "",
        style: `min-height:${minHeight}px`,
      },
    },
    immediatelyRender: false,
    onUpdate({ editor }) {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // 外部 value 变化(例如用户切换模板加载了不同数据)时同步
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      // setContent 不支持 emitUpdate 选项(v2),通过设置 lastEmittedRef
      // 并由编辑器在下一次 onUpdate 时刷新;这里直接同步并接受 1 次冗余回写
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) return <div className={styles.skeleton} style={{ minHeight }} />;

  return (
    <div className={styles.wrap}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const Btn = ({
    active,
    onClick,
    title,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={active ? styles.tbBtnActive : styles.tbBtn}
    >
      {children}
    </button>
  );

  return (
    <div className={styles.toolbar}>
      <Btn
        title="加粗"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </Btn>
      <Btn
        title="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </Btn>
      <Btn
        title="无序列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </Btn>
      <Btn
        title="有序列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </Btn>
      <Btn
        title="插入链接"
        active={editor.isActive("link")}
        onClick={() => {
          const url = window.prompt("链接 URL", editor.getAttributes("link").href ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        🔗
      </Btn>
    </div>
  );
}