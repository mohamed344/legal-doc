"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { FontFamily } from "@tiptap/extension-font-family";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Redo2,
  Undo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Link2,
  ImageIcon,
  Highlighter,
  Palette,
  ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { detectDir } from "@/lib/text/direction";
import { FontSize } from "./extensions/font-size";

interface Props {
  content?: string;
  onChange?: (html: string) => void;
  onInsertVariable?: (insert: (key: string) => void) => void;
}

const MAX_IMAGE_BYTES = 256 * 1024; // 256 KB inline cap

const COLOR_SWATCHES = [
  "#000000", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#ffffff",
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb",
  "#7c3aed", "#db2777", "#1a4f8a", "#7f1d1d", "#14532d", "#1e3a8a",
];

const HIGHLIGHT_SWATCHES = [
  "#fff59d", "#ffe082", "#ffab91", "#f48fb1", "#ce93d8", "#90caf9",
  "#80deea", "#a5d6a7", "#e6ee9c", "#fff9c4", "#ffccbc", "#d1c4e9",
];

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "ui-monospace, 'Courier New', monospace" },
  { label: "Amiri", value: "'Amiri', serif" },
  { label: "Noto Naskh Arabic", value: "'Noto Naskh Arabic', serif" },
];

const FONT_SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt", "36pt"];

export function TemplateEditor({ content = "", onChange }: Props) {
  const locale = useLocale();
  const t = useTranslations("templates.editor");
  const tRef = useRef(t);
  tRef.current = t;

  // Initial direction from locale + content sniff (mount-only).
  // Per-paragraph direction is a known limitation; this controls the editor surface as a whole.
  const [dir, setDir] = useState<"ltr" | "rtl">(() => detectDir(content, locale));
  // Track HTML the editor itself emitted, so we don't loop when the parent passes it back.
  const lastEmittedHtml = useRef<string>(content);

  const editor = useEditor({
    immediatelyRender: false,
    // Order matters: TextStyle must come before Color/FontFamily/FontSize (they extend it).
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Subscript,
      Superscript,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: () => tRef.current("placeholder") }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedHtml.current = html;
      onChange?.(html);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-stone prose-sm md:prose-base max-w-none focus:outline-none min-h-[420px] px-5 py-4 font-sans leading-relaxed",
      },
      handlePaste: (_view, event) => handleImagePaste(event, (file) => insertImageFile(file)),
      handleDrop: (_view, event) => handleImageDrop(event, (file) => insertImageFile(file)),
    },
  });

  useEffect(() => {
    if (!editor) return;
    // Skip if the parent is just echoing back what we emitted (avoids feedback loop on keystroke).
    if (content === lastEmittedHtml.current) return;
    lastEmittedHtml.current = content;
    editor.commands.setContent(content, { emitUpdate: false });
    setDir(detectDir(content, locale));
  }, [content, editor, locale]);

  const insertImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return false;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(
        locale === "ar"
          ? `الصورة كبيرة جدًا (الحد الأقصى ${Math.floor(MAX_IMAGE_BYTES / 1024)} كيلوبايت)`
          : `Image trop volumineuse (max ${Math.floor(MAX_IMAGE_BYTES / 1024)} Ko)`,
      );
      return true;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      if (typeof src === "string") {
        editor?.chain().focus().setImage({ src }).run();
      }
    };
    reader.readAsDataURL(file);
    return true;
  };

  if (!editor) return null;

  return (
    <div className="rounded-md border border-border/60 bg-card overflow-hidden" dir={dir}>
      <EditorToolbar
        editor={editor}
        dir={dir}
        onToggleDir={() => setDir((d) => (d === "rtl" ? "ltr" : "rtl"))}
        onPickImage={(file) => insertImageFile(file)}
      />
      <EditorContent editor={editor} dir={dir} />
    </div>
  );
}

function handleImagePaste(event: ClipboardEvent, insert: (file: File) => boolean): boolean {
  const items = event.clipboardData?.items;
  if (!items) return false;
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        insert(file);
        return true;
      }
    }
  }
  return false;
}

function handleImageDrop(event: DragEvent, insert: (file: File) => boolean): boolean {
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return false;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/")) {
      event.preventDefault();
      insert(file);
      return true;
    }
  }
  return false;
}

function EditorToolbar({
  editor,
  dir,
  onToggleDir,
  onPickImage,
}: {
  editor: Editor;
  dir: "ltr" | "rtl";
  onToggleDir: () => void;
  onPickImage: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFontFamily = editor.getAttributes("textStyle").fontFamily ?? "";
  const currentFontSize = editor.getAttributes("textStyle").fontSize ?? "";

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-sand/40 px-2 py-1.5">
      {/* Group 1: text formatting */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <Sep />

      {/* Group 2: font family + size */}
      <Select
        value={currentFontFamily}
        onValueChange={(v) => {
          if (!v) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Police" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.label} value={f.value}>
              <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentFontSize}
        onValueChange={(v) => {
          if (!v) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(v).run();
        }}
      >
        <SelectTrigger className="h-8 w-[80px] text-xs">
          <SelectValue placeholder="Taille" />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Sep />

      {/* Group 3: color + highlight */}
      <ColorPickerButton
        icon={<Palette className="h-4 w-4" />}
        title="Text color"
        swatches={COLOR_SWATCHES}
        value={editor.getAttributes("textStyle").color ?? "#000000"}
        onPick={(c) => {
          if (!c) editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(c).run();
        }}
      />
      <ColorPickerButton
        icon={<Highlighter className="h-4 w-4" />}
        title="Highlight"
        swatches={HIGHLIGHT_SWATCHES}
        value={editor.getAttributes("highlight").color ?? "#fff59d"}
        onPick={(c) => {
          if (!c) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().setHighlight({ color: c }).run();
        }}
      />

      <Sep />

      {/* Group 4: sub/sup */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        active={editor.isActive("subscript")}
        title="Subscript"
      >
        <SubIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        active={editor.isActive("superscript")}
        title="Superscript"
      >
        <SupIcon className="h-4 w-4" />
      </ToolbarButton>

      {/* Row break for narrow screens — flex-wrap will fold the rest below */}
      <span className="basis-full h-0" />

      {/* Group 5: headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Sep />

      {/* Group 6: lists + quote */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <Sep />

      {/* Group 7: alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Align left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Align center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Align right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        title="Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <Sep />

      {/* Group 8: direction toggle */}
      <ToolbarButton onClick={onToggleDir} title={dir === "rtl" ? "Switch to LTR" : "Switch to RTL"}>
        <ArrowLeftRight className="h-4 w-4" />
      </ToolbarButton>

      <Sep />

      {/* Group 9: link / image / table */}
      <LinkButton editor={editor} />
      <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Insert image">
        <ImageIcon className="h-4 w-4" />
      </ToolbarButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickImage(file);
          e.target.value = "";
        }}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Insert table"
      >
        <TableIcon className="h-4 w-4" />
      </ToolbarButton>

      <Sep />

      {/* Group 10: history */}
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function ColorPickerButton({
  icon,
  title,
  swatches,
  value,
  onPick,
}: {
  icon: React.ReactNode;
  title: string;
  swatches: string[];
  value: string;
  onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title={title}>
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="grid grid-cols-6 gap-1.5">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="h-6 w-6 rounded border border-border/60 hover:scale-110 transition"
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onPick(e.target.value)}
            className="h-7 w-10 cursor-pointer border-none bg-transparent p-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const apply = () => {
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
    }
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setUrl((editor.getAttributes("link").href as string) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn("h-8 w-8", editor.isActive("link") && "bg-primary/10 text-primary")}
          title="Insert link"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
          />
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setOpen(false);
              }}
              disabled={!editor.isActive("link")}
            >
              Remove
            </Button>
            <Button type="button" size="sm" onClick={apply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarButton({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onClick}
      title={title}
      className={cn("h-8 w-8", active && "bg-primary/10 text-primary")}
    >
      {children}
    </Button>
  );
}
