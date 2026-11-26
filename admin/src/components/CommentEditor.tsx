import {
  HtmlEditor,
  Inject,
  Link,
  PasteCleanup,
  QuickToolbar,
  RichTextEditorComponent,
  Toolbar,
} from "@syncfusion/ej2-react-richtexteditor";

/*
 * Rich text for an image comment (HD-14). The toolbar offers only what the
 * site keeps: the API strips anything else on save, so the editor shouldn't
 * invite it. Pasted text keeps bold, italic, links and lists, nothing else.
 */
const TOOLBAR = {
  items: ["Bold", "Italic", "Underline", "|", "OrderedList", "UnorderedList", "|", "CreateLink", "InlineCode", "|", "ClearFormat", "Undo", "Redo"],
};

const PASTE = {
  prompt: false,
  plainText: false,
  keepFormat: false,
  allowedStyleProps: [],
  deniedAttrs: ["class", "style", "id"],
  deniedTags: ["img", "table", "script", "style", "iframe", "h1", "h2", "h3", "h4", "h5", "h6"],
};

export function CommentEditor({
  value,
  onChange,
  placeholder = "Optional. Your notes on this image: technologies, approach, what to look at.",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  return (
    <RichTextEditorComponent
      value={value || ""}
      height={180}
      placeholder={placeholder}
      toolbarSettings={TOOLBAR}
      pasteCleanupSettings={PASTE}
      // Report edits as they happen, not only on leaving the editor.
      saveInterval={400}
      change={(event: { value: string | null }) => onChange(event.value ?? "")}
    >
      <Inject services={[Toolbar, Link, HtmlEditor, QuickToolbar, PasteCleanup]} />
    </RichTextEditorComponent>
  );
}
