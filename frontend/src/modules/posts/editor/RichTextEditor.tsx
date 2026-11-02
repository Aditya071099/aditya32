"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { hasLibraryImageMediaIdMismatch } from "@/lib/content";
import { MediaPickerModal } from "@/modules/media/MediaPickerModal";
import type { ContentDoc } from "@/types/content";
import type { MarkdownSourceRef } from "@/types/markdown";
import { editorExtensions } from "./extensions";
import { MarkdownSourceBar } from "./MarkdownSourceBar";
import { useMarkdownImport } from "./useMarkdownImport";

export interface RichTextEditorProps {
  value: ContentDoc;
  onChange: (doc: ContentDoc) => void;
  markdownSource: MarkdownSourceRef | null;
  onMarkdownSourceChange: (source: MarkdownSourceRef | null) => void;
  /** The source id currently saved on the post, if any — an unsaved upload is safe to
   * delete immediately on Remove/Replace; a saved one waits for deleteIfUnused on Save. */
  savedMarkdownSourceId: string | null;
  /** True while an imported file is uploading, so the page can block navigation. */
  onImportingChange: (importing: boolean) => void;
}

/**
 * The post body editor. Content goes in and out as Tiptap JSON — the format the
 * backend stores — never HTML.
 */
export function RichTextEditor({
  value,
  onChange,
  markdownSource,
  onMarkdownSourceChange,
  savedMarkdownSourceId,
  onImportingChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: value,
    // Rendered on the client only; skipping the server pass avoids a hydration mismatch.
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as ContentDoc),
    editorProps: {
      attributes: { class: "post-content", "aria-label": "Post content", "aria-multiline": "true", role: "textbox" },
    },
  });
  const markdownImport = useMarkdownImport(
    editor,
    onMarkdownSourceChange,
    onImportingChange,
    markdownSource,
    savedMarkdownSourceId,
  );

  return (
    <>
      <MarkdownSourceBar
        source={markdownSource}
        uploading={markdownImport.uploading || markdownImport.removing}
        onImport={markdownImport.openFilePicker}
        onRemove={() => void markdownImport.removeSource()}
      />
      {markdownImport.ui}
      <div className="rounded-lg border-[1.5px] border-line bg-card shadow-card">
        {editor ? <Toolbar editor={editor} /> : <div className="h-[42px] border-b border-line" />}
        <EditorContent editor={editor} className="min-h-[420px] px-6 py-5" />
      </div>
    </>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [replacementPosition, setReplacementPosition] = useState<number | null>(null);

  // The toolbar re-renders only when one of these flags changes, not on every keystroke.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      paragraph: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      invalidImagePosition: (() => {
        let position: number | null = null;
        e.state.doc.descendants((node, pos) => {
          if (
	    position === null &&
            node.type.name === "image" &&
            hasLibraryImageMediaIdMismatch(node.attrs.src, node.attrs.mediaId)
          ) {
            position = pos;
          }
        });
        return position;
      })(),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-line bg-card px-2 py-1.5"
    >
      <ToolButton icon={Pilcrow} label="Paragraph" active={state.paragraph} onClick={() => chain().setParagraph().run()} />
      <ToolButton icon={Heading2} label="Heading 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label="Heading 3" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <ToolButton icon={Bold} label="Bold (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={Underline} label="Underline (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()} />
      <ToolButton icon={Code} label="Inline code" active={state.code} onClick={() => chain().toggleCode().run()} />
      <ToolButton icon={Link2} label="Link (Ctrl+K)" active={state.link} onClick={() => setLinkOpen(true)} />
      <Divider />
      <ToolButton icon={List} label="Bulleted list" active={state.bulletList} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={Quote} label="Quote" active={state.blockquote} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={SquareCode} label="Code block" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()} />
      <ToolButton icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
      <ToolButton
        icon={ImagePlus}
        label="Insert image"
        onClick={() => {
          setReplacementPosition(editor.isActive("image") ? editor.state.selection.from : null);
          setImageOpen(true);
        }}
      />
      <div className="flex-1" />
      {state.invalidImagePosition !== null && (
        <div role="alert" className="flex w-full items-center gap-2 border-t border-warning/30 px-2 pt-2 text-[11px] text-warning">
          <span className="flex-1">An image&apos;s media ID does not match its source URL.</span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2 hover:text-ink"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (state.invalidImagePosition !== null) {
                setReplacementPosition(state.invalidImagePosition);
                editor.chain().focus().setNodeSelection(state.invalidImagePosition).run();
                setImageOpen(true);
              }
            }}
          >
            Replace image
          </button>
        </div>
      )}
      <ToolButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!state.canRedo} onClick={() => chain().redo().run()} />

      <LinkShortcut editor={editor} onOpen={() => setLinkOpen(true)} />
      {linkOpen && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      {imageOpen && (
        <MediaPickerModal
          title="Insert image"
          onClose={() => {
            setImageOpen(false);
            setReplacementPosition(null);
          }}
          onSelect={(media) => {
            const attrs = { src: media.url, alt: media.altText, mediaId: media.id };
            const command = editor.chain().focus();
            if (replacementPosition !== null) {
              command.setNodeSelection(replacementPosition).updateAttributes("image", attrs).run();
              setReplacementPosition(null);
            } else {
              command.insertContent({ type: "image", attrs }).run();
            }
          }}
        />
      )}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: a mousedown on the button would otherwise blur the editor first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        active ? "bg-green text-ink" : "text-secondary hover:bg-hover hover:text-ink",
      )}
    >
      <Icon size={15} />
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-line" />;
}

/** Ctrl/Cmd+K opens the link dialog while the editor has focus. */
function LinkShortcut({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
  useEffect(() => {
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, onOpen]);
  return null;
}

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(existing);
  const trimmed = href.trim();
  const valid = /^(https?:\/\/|mailto:|\/|#)\S*$/i.test(trimmed);

  const apply = () => {
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (valid) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      return;
    }
    onClose();
  };

  return (
    <Modal
      title={existing ? "Edit link" : "Add link"}
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          {existing && (
            <button
              type="button"
              className="btn btn-ghost mr-auto"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                onClose();
              }}
            >
              Remove link
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={Boolean(trimmed) && !valid}>
            Apply
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor="link-href" className="field-label">
          URL
        </label>
        <input
          id="link-href"
          className="input"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="https://example.com"
          aria-invalid={Boolean(trimmed) && !valid}
        />
        <p className="text-[11px] text-muted">
          {trimmed && !valid ? "Start with https://, http://, mailto:, / or #." : "Select text first to turn it into a link."}
        </p>
      </form>
    </Modal>
  );
}
