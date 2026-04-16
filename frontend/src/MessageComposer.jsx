import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import EmojiPicker from "emoji-picker-react";
import { useState, useRef, useEffect, useCallback } from "react";
import "./MessageComposer.css";
import { API } from "./api";
import { useI18n } from "./i18n";

const GIPHY_KEY = "dc6zaTOxFJmzC";
const GIPHY_SEARCH = "https://api.giphy.com/v1/gifs/search";
const GIPHY_TRENDING = "https://api.giphy.com/v1/gifs/trending";

function ToolbarButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      className={`composer-toolbar-btn${active ? " composer-toolbar-btn--active" : ""}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export default function MessageComposer({ onSend, disabled }) {
  const { t } = useI18n();
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const emojiRef = useRef(null);
  const gifRef = useRef(null);
  const fileInputRef = useRef(null);
  const gifDebounce = useRef(null);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: "",
    editorProps: {
      attributes: { class: "composer-editor-inner" },
      handleKeyDown(view, event) {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
      if (gifRef.current && !gifRef.current.contains(e.target)) setShowGif(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!showGif) return;
    if (gifs.length === 0 && !gifQuery) {
      setGifLoading(true);
      fetch(`${GIPHY_TRENDING}?api_key=${GIPHY_KEY}&limit=20&rating=g`)
        .then(r => r.ok ? r.json() : { data: [] })
        .then(d => { setGifs(d.data || []); setGifLoading(false); })
        .catch(() => setGifLoading(false));
    }
  }, [showGif]);

  const searchGifs = (q) => {
    setGifQuery(q);
    clearTimeout(gifDebounce.current);
    if (!q.trim()) {
      setGifLoading(true);
      gifDebounce.current = setTimeout(() => {
        fetch(`${GIPHY_TRENDING}?api_key=${GIPHY_KEY}&limit=20&rating=g`)
          .then(r => r.ok ? r.json() : { data: [] })
          .then(d => { setGifs(d.data || []); setGifLoading(false); });
      }, 300);
      return;
    }
    setGifLoading(true);
    gifDebounce.current = setTimeout(() => {
      fetch(`${GIPHY_SEARCH}?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=g`)
        .then(r => r.ok ? r.json() : { data: [] })
        .then(d => { setGifs(d.data || []); setGifLoading(false); });
    }, 400);
  };

  const insertGif = (gif) => {
    const url = gif.images?.fixed_height?.url || gif.images?.original?.url;
    if (!url) return;
    setShowGif(false);
    onSend({ content: "", imageUrl: url });
  };

  const handleEmojiClick = (emojiData) => {
    editor?.commands.insertContent(emojiData.emoji);
    setShowEmoji(false);
    editor?.commands.focus();
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(API.UPLOAD_IMAGE, { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      if (data.url) {
        setPendingImage({ url: data.url, name: file.name });
      }
    } catch {}
    setUploading(false);
    e.target.value = "";
  };

  const removePendingImage = () => setPendingImage(null);

  const handleSend = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const plainText = editor.getText();
    const hasContent = plainText.trim().length > 0;
    if (!hasContent && !pendingImage) return;
    onSend({ content: hasContent ? html : "", imageUrl: pendingImage?.url || null });
    editor.commands.clearContent();
    setPendingImage(null);
  }, [editor, pendingImage, onSend]);

  if (!editor) return null;

  return (
    <div className="composer-wrap">
      <div className="composer-toolbar">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Pogrubienie (Ctrl+B)">
          <b>B</b>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Kursywa (Ctrl+I)">
          <i>I</i>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Podkreślenie (Ctrl+U)">
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Przekreślenie">
          <s>S</s>
        </ToolbarButton>
        <div className="composer-toolbar-divider" />
        <div className="composer-dropdown-wrap" ref={emojiRef}>
          <ToolbarButton onClick={() => { setShowEmoji(v => !v); setShowGif(false); }} title="Emotikony">
            😊
          </ToolbarButton>
          {showEmoji && (
            <div className="composer-dropdown composer-emoji-dropdown">
              <EmojiPicker onEmojiClick={handleEmojiClick} height={350} width={320} searchDisabled={false} />
            </div>
          )}
        </div>
        <div className="composer-dropdown-wrap" ref={gifRef}>
          <ToolbarButton onClick={() => { setShowGif(v => !v); setShowEmoji(false); }} title="GIF">
            <span style={{ fontWeight: 700, fontSize: "0.75rem", letterSpacing: "-0.5px" }}>GIF</span>
          </ToolbarButton>
          {showGif && (
            <div className="composer-dropdown composer-gif-dropdown">
              <input
                className="composer-gif-search"
                type="text"
                placeholder="Szukaj GIF..."
                value={gifQuery}
                onChange={e => searchGifs(e.target.value)}
                autoFocus
              />
              <div className="composer-gif-grid">
                {gifLoading && <div className="composer-gif-loading">Ładowanie...</div>}
                {!gifLoading && gifs.length === 0 && <div className="composer-gif-loading">Brak wyników</div>}
                {gifs.map(g => (
                  <img
                    key={g.id}
                    className="composer-gif-item"
                    src={g.images?.fixed_height_small?.url || g.images?.fixed_height?.url}
                    alt={g.title}
                    onClick={() => insertGif(g)}
                    loading="lazy"
                  />
                ))}
              </div>
              <div className="composer-gif-powered">Powered by GIPHY</div>
            </div>
          )}
        </div>
        <ToolbarButton onClick={() => fileInputRef.current?.click()} title={t("messages.sendPhoto")}>
          {uploading ? "⏳" : "🖼️"}
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageSelect} />
      </div>

      {pendingImage && (
        <div className="composer-pending-image">
          <img src={pendingImage.url} alt="attachment" />
          <button type="button" className="composer-pending-remove" onClick={removePendingImage} title="Usuń">✕</button>
        </div>
      )}

      <div className="composer-input-row">
        <div className="composer-editor-wrap">
          <EditorContent editor={editor} />
        </div>
        <button
          type="button"
          className="composer-send-btn"
          onClick={handleSend}
          disabled={disabled || uploading}
          title={t("messages.sendBtn")}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
