import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { sanitizeRichText, toRichHtml } from "@/lib/rich-text";

const FONT_SIZES = ["13px", "15px", "17px", "20px", "24px", "30px"];
const SWATCHES = [
  "#041f1e",
  "#f48721",
  "#dc2626",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#64748b",
];

function Btn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled ?? false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg border text-sm transition-colors disabled:opacity-40",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const headingValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";

  const currentSize = (editor.getAttributes("textStyle")["fontSize"] as string) || "";

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-muted/40 px-2 py-1.5">
      <select
        value={headingValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 })
              .run();
        }}
        className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs font-semibold"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <select
        value={currentSize}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(v).run();
        }}
        className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs font-semibold"
      >
        <option value="">Size</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s.replace("px", "")}
          </option>
        ))}
      </select>

      <span className="mx-1 h-5 w-px bg-border" />

      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </Btn>
      <Btn
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </Btn>
      <Btn
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </Btn>

      <span className="mx-1 h-5 w-px bg-border" />

      <div className="flex items-center gap-0.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={`Text colour ${c}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setColor(c).run()}
            className="size-5 rounded-full border border-border/70 transition-transform hover:scale-110"
            style={{ background: c }}
          />
        ))}
        <input
          type="color"
          title="Custom text colour"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="size-6 cursor-pointer rounded border border-border/70 bg-transparent p-0"
        />
        <Btn
          title="Highlight"
          active={editor.isActive("highlight")}
          onClick={() => editor.chain().focus().toggleHighlight({ color: "#fde68a" }).run()}
        >
          <span className="rounded bg-yellow-200 px-1 text-[11px] font-bold text-yellow-900">H</span>
        </Btn>
      </div>

      <span className="mx-1 h-5 w-px bg-border" />

      <Btn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </Btn>
      <Btn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </Btn>
      <Btn
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </Btn>

      <span className="mx-1 h-5 w-px bg-border" />

      <Btn
        title="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="size-4" />
      </Btn>
      <Btn
        title="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="size-4" />
      </Btn>
      <Btn
        title="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="size-4" />
      </Btn>
      <Btn
        title="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="size-4" />
      </Btn>

      <span className="mx-1 h-5 w-px bg-border" />

      <Btn
        title="Add link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = (editor.getAttributes("link")["href"] as string) ?? "";
          const url = window.prompt("Link URL", prev);
          if (url === null) return;
          if (!url.trim()) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }}
      >
        <Link2 className="size-4" />
      </Btn>
      <Btn
        title="Remove link"
        disabled={!editor.isActive("link")}
        onClick={() => editor.chain().focus().unsetLink().run()}
      >
        <Link2Off className="size-4" />
      </Btn>
      <Btn
        title="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="size-4" />
      </Btn>



      <span className="ml-auto flex items-center gap-1">
        <Btn title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="size-4" />
        </Btn>
        <Btn title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="size-4" />
        </Btn>
      </span>
    </div>
  );
}

export function RichTextEditor({
  label,
  value,
  onChange,
  hint,
  minHeight = 180,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
  minHeight?: number;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: toRichHtml(value),
    editorProps: {
      attributes: {
        class: "rich-text focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html === "<p></p>" ? "" : sanitizeRichText(html));
    },
  });

  // Keep the editor aligned when an existing row is selected or the form resets.
  useEffect(() => {
    if (!editor) return;
    const incoming = toRichHtml(value);
    const current = editor.getHTML();
    const normalizedIncoming = incoming || "<p></p>";
    if (normalizedIncoming !== current) editor.commands.setContent(normalizedIncoming, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="group/field space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors group-focus-within/field:text-primary">
        {label}
      </Label>
      <div className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-background/70 transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
        {editor ? <Toolbar editor={editor} /> : null}
        <EditorContent editor={editor} className="px-3 py-2.5 text-sm" />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
