'use client';

// src/components/SearchBar.tsx
import { useState, useEffect, useRef } from "react";
import { useSearch, useAkropolysContext } from "@akropolys/sdk";

// src/utils/cn.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/components/SearchBar.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var SearchIcon = () => /* @__PURE__ */ jsxs("svg", { width: "15", height: "15", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [
  /* @__PURE__ */ jsx("circle", { cx: "8.5", cy: "8.5", r: "5.5" }),
  /* @__PURE__ */ jsx("line", { x1: "13", y1: "13", x2: "18", y2: "18" })
] });
function SearchBar({
  placeholder = "Search products\u2026",
  limit = 10,
  debounceMs = 300,
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  renderResult,
  theme,
  classNames = {}
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const { results, loading, search, clear } = useSearch();
  const client = useAkropolysContext();
  const timer = useRef();
  const wrap = useRef(null);
  const ignoreNextQueryChange = useRef(false);
  useEffect(() => {
    if (ignoreNextQueryChange.current) {
      ignoreNextQueryChange.current = false;
      return;
    }
    clearTimeout(timer.current);
    if (!query.trim()) {
      clear();
      setOpen(false);
      setIsDebouncing(false);
      return;
    }
    setOpen(true);
    setIsDebouncing(true);
    timer.current = setTimeout(() => {
      setIsDebouncing(false);
      search(query, limit);
    }, debounceMs);
    return () => clearTimeout(timer.current);
  }, [query]);
  useEffect(() => {
    const h = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const handleSelect = (r) => {
    if (query.trim()) {
      client.api.searchVector(query, 1).catch(() => {
      });
    }
    ignoreNextQueryChange.current = true;
    setOpen(false);
    setQuery(r.product.name);
    onSelect?.(r);
  };
  const handleCommitSearch = () => {
    if (!query.trim()) return;
    client.api.searchVector(query, 1).catch(() => {
    });
    if (results.length > 0) {
      handleSelect(results[0]);
    }
  };
  const showDrop = open && query.trim().length > 0;
  const customStyles = {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  };
  return /* @__PURE__ */ jsxs("div", { className: cn("hsk-sb-wrap", classNames.root, className), ref: wrap, style: customStyles, children: [
    /* @__PURE__ */ jsx("span", { className: "hsk-sb-icon", children: /* @__PURE__ */ jsx(SearchIcon, {}) }),
    /* @__PURE__ */ jsx(
      "input",
      {
        className: cn("hsk-sb-input", classNames.input, inputClassName),
        type: "text",
        value: query,
        placeholder,
        onChange: (e) => setQuery(e.target.value),
        onFocus: () => results.length > 0 && query.trim() && setOpen(true),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            handleCommitSearch();
          }
        },
        autoComplete: "off",
        spellCheck: false
      }
    ),
    showDrop && /* @__PURE__ */ jsxs("div", { className: cn("hsk-sb-drop", classNames.dropdown, dropdownClassName), style: { position: "absolute" }, children: [
      (loading || isDebouncing) && /* @__PURE__ */ jsx("div", { className: "hsk-sb-loading-bar" }),
      (loading || isDebouncing) && results.length === 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "hsk-sb-skeleton-row", children: [
          /* @__PURE__ */ jsx("span", { className: "hsk-sb-skeleton-icon" }),
          /* @__PURE__ */ jsxs("div", { className: "hsk-sb-row-body", children: [
            /* @__PURE__ */ jsx("div", { className: "hsk-sb-skeleton-text1" }),
            /* @__PURE__ */ jsx("div", { className: "hsk-sb-skeleton-text2" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "hsk-sb-skeleton-row", children: [
          /* @__PURE__ */ jsx("span", { className: "hsk-sb-skeleton-icon" }),
          /* @__PURE__ */ jsxs("div", { className: "hsk-sb-row-body", children: [
            /* @__PURE__ */ jsx("div", { className: "hsk-sb-skeleton-text1", style: { width: "45%" } }),
            /* @__PURE__ */ jsx("div", { className: "hsk-sb-skeleton-text2", style: { width: "25%" } })
          ] })
        ] })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        results.length === 0 && !loading && !isDebouncing && /* @__PURE__ */ jsxs("div", { className: "hsk-sb-empty", children: [
          "No results for \u201C",
          query,
          "\u201D"
        ] }),
        results.map((r, i) => renderResult ? /* @__PURE__ */ jsx(
          "div",
          {
            onClick: () => handleSelect(r),
            className: "hsk-sb-fade",
            style: { animationDelay: `${i * 18}ms` },
            children: renderResult(r)
          },
          r.id
        ) : /* @__PURE__ */ jsxs(
          "div",
          {
            className: cn("hsk-sb-row hsk-sb-fade", classNames.row),
            style: { animationDelay: `${i * 18}ms` },
            onClick: () => handleSelect(r),
            children: [
              /* @__PURE__ */ jsx("span", { className: "hsk-sb-row-icon", children: /* @__PURE__ */ jsx(SearchIcon, {}) }),
              /* @__PURE__ */ jsxs("div", { className: "hsk-sb-row-body", children: [
                /* @__PURE__ */ jsx("div", { className: "hsk-sb-row-title", children: r.product.name }),
                (r.product.category || r.product.brand) && /* @__PURE__ */ jsx("div", { className: "hsk-sb-row-sub", children: r.product.category ?? r.product.brand })
              ] })
            ]
          },
          r.id
        ))
      ] })
    ] })
  ] });
}

// src/components/ChatWidget.tsx
import { useState as useState4, useRef as useRef4, useEffect as useEffect2 } from "react";
import { useKiku } from "@akropolys/sdk";

// src/utils/markdown.tsx
import { Fragment as Fragment2, jsx as jsx2 } from "react/jsx-runtime";
var parseInline = (text, keyPrefix) => {
  const tokenRegex = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${keyPrefix}-inline-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) {
      return /* @__PURE__ */ jsx2("code", { className: "hsk-markdown-code", children: part.slice(1, -1) }, key);
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return /* @__PURE__ */ jsx2("strong", { children: parseInline(part.slice(2, -2), key) }, key);
    }
    const imageMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      const alt = imageMatch[1];
      const url = imageMatch[2];
      const isSafeUrl = /^(https?|data:image):/i.test(url);
      if (isSafeUrl) {
        return /* @__PURE__ */ jsx2(
          "img",
          {
            src: url,
            alt: alt || "Product image",
            className: "hsk-markdown-img",
            loading: "lazy",
            onError: (e) => {
              e.target.style.display = "none";
            }
          },
          key
        );
      }
      return null;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const url = linkMatch[2];
      const isSafeUrl = /^(https?|mailto|tel):/i.test(url) || url.startsWith("/");
      if (isSafeUrl) {
        return /* @__PURE__ */ jsx2("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "hsk-markdown-link", children: parseInline(linkMatch[1], key) }, key);
      }
      return /* @__PURE__ */ jsx2("span", { children: parseInline(linkMatch[1], key) }, key);
    }
    return part;
  });
};
function renderMarkdown(content) {
  const lines = content.split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `md-line-${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const standaloneImageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standaloneImageMatch) {
      const alt = standaloneImageMatch[1];
      const url = standaloneImageMatch[2];
      const isSafeUrl = /^(https?|data:image):/i.test(url);
      if (isSafeUrl) {
        elements.push(
          /* @__PURE__ */ jsx2("div", { className: "hsk-markdown-img-block", children: /* @__PURE__ */ jsx2(
            "img",
            {
              src: url,
              alt: alt || "Product image",
              className: "hsk-markdown-img",
              loading: "lazy",
              onError: (e) => {
                e.target.style.display = "none";
              }
            }
          ) }, key)
        );
      }
      i++;
      continue;
    }
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level + 3}`;
      elements.push(/* @__PURE__ */ jsx2(Tag, { className: `hsk-markdown-h${level}`, children: parseInline(headerMatch[2], key) }, key));
      i++;
      continue;
    }
    if (line.match(/^[-*]\s+/)) {
      const listItems = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, "");
        listItems.push(/* @__PURE__ */ jsx2("li", { children: parseInline(itemText, `li-${i}`) }, `li-${i}`));
        i++;
      }
      elements.push(/* @__PURE__ */ jsx2("ul", { className: "hsk-markdown-list", children: listItems }, `ul-${key}`));
      continue;
    }
    if (line.trim().startsWith("|")) {
      const tableRows = [];
      let isHeader = true;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const rowLine = lines[i].trim();
        if (rowLine.match(/^\|[-:| ]+\|$/)) {
          i++;
          isHeader = false;
          continue;
        }
        const cells = rowLine.split("|").slice(1, -1).map((c) => c.trim());
        const Tag = isHeader ? "th" : "td";
        tableRows.push(
          /* @__PURE__ */ jsx2("tr", { children: cells.map((cell, cIdx) => /* @__PURE__ */ jsx2(Tag, { children: parseInline(cell, `td-${i}-${cIdx}`) }, `td-${i}-${cIdx}`)) }, `tr-${i}`)
        );
        i++;
      }
      elements.push(
        /* @__PURE__ */ jsx2("div", { className: "hsk-table-wrapper", children: /* @__PURE__ */ jsx2("table", { className: "hsk-markdown-table", children: /* @__PURE__ */ jsx2("tbody", { children: tableRows }) }) }, `table-wrapper-${key}`)
      );
      continue;
    }
    elements.push(
      /* @__PURE__ */ jsx2("p", { className: "hsk-markdown-p", children: parseInline(line, key) }, key)
    );
    i++;
  }
  return /* @__PURE__ */ jsx2(Fragment2, { children: elements });
}

// src/components/VoiceButton.tsx
import { useState as useState2, useRef as useRef2, useCallback } from "react";
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var MicIcon = ({ active }) => /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx3("rect", { x: "9", y: "2", width: "6", height: "11", rx: "3", fill: active ? "currentColor" : "none" }),
  /* @__PURE__ */ jsx3("path", { d: "M5 10a7 7 0 0 0 14 0" }),
  /* @__PURE__ */ jsx3("line", { x1: "12", y1: "19", x2: "12", y2: "23" }),
  /* @__PURE__ */ jsx3("line", { x1: "8", y1: "23", x2: "16", y2: "23" })
] });
function VoiceButton({
  onTranscript,
  onInterim,
  lang = "en-US",
  className = "",
  disabled = false
}) {
  const [listening, setListening] = useState2(false);
  const recognitionRef = useRef2(null);
  const isSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const start = useCallback(() => {
    if (!isSupported || listening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (e) => {
      const results = Array.from(e.results);
      const transcript = results.map((r) => r[0].transcript).join("");
      const isFinal = e.results[e.results.length - 1].isFinal;
      if (isFinal) {
        onTranscript(transcript);
        setListening(false);
      } else {
        onInterim?.(transcript);
      }
    };
    recognition.start();
  }, [isSupported, listening, lang, onTranscript, onInterim]);
  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);
  if (!isSupported) return null;
  return /* @__PURE__ */ jsxs2(
    "button",
    {
      type: "button",
      className: `kiku-voice-btn${listening ? " kiku-voice-btn--active" : ""} ${className}`,
      onClick: listening ? stop : start,
      disabled,
      title: listening ? "Stop listening" : "Speak your search",
      "aria-label": listening ? "Stop voice input" : "Start voice input",
      children: [
        /* @__PURE__ */ jsx3(MicIcon, { active: listening }),
        listening && /* @__PURE__ */ jsx3("span", { className: "kiku-voice-ripple", "aria-hidden": "true" })
      ]
    }
  );
}

// src/components/VisualSearch.tsx
import { useRef as useRef3, useState as useState3 } from "react";
import { useAkropolysContext as useAkropolysContext2 } from "@akropolys/sdk";
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var CameraIcon = () => /* @__PURE__ */ jsxs3("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx4("path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }),
  /* @__PURE__ */ jsx4("circle", { cx: "12", cy: "13", r: "4" })
] });
var SpinnerIcon = () => /* @__PURE__ */ jsx4("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", className: "kiku-vs-spin", children: /* @__PURE__ */ jsx4("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) });
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function VisualSearch({
  onResults,
  onError,
  categoryHint,
  className = "",
  disabled = false
}) {
  const client = useAkropolysContext2();
  const inputRef = useRef3(null);
  const [loading, setLoading] = useState3(false);
  const handleFile = async (file) => {
    if (!file.type.startsWith("image/")) return;
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await client.api.searchByImage(base64, categoryHint);
      onResults(res, base64);
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return /* @__PURE__ */ jsxs3(
    "label",
    {
      className: `kiku-vs-btn${loading ? " kiku-vs-btn--loading" : ""} ${className}`,
      title: "Search by photo",
      "aria-label": "Search by uploading a photo",
      style: { cursor: disabled || loading ? "not-allowed" : "pointer" },
      children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            ref: inputRef,
            type: "file",
            accept: "image/*",
            capture: "environment",
            onChange: (e) => e.target.files?.[0] && handleFile(e.target.files[0]),
            disabled: disabled || loading,
            hidden: true
          }
        ),
        loading ? /* @__PURE__ */ jsx4(SpinnerIcon, {}) : /* @__PURE__ */ jsx4(CameraIcon, {})
      ]
    }
  );
}

// src/components/ChatWidget.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var SparkleIcon = () => /* @__PURE__ */ jsx5("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx5("path", { d: "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" }) });
var ArrowUpIcon = () => /* @__PURE__ */ jsxs4("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx5("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ jsx5("path", { d: "M12 19V5" })
] });
function SourceCard({
  source,
  defaultCurrency,
  onSelect,
  isReferenced
}) {
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: cn("hsk-source-card", isReferenced && "hsk-source-card--referenced"),
      onClick: () => onSelect?.(source),
      children: [
        source.image && /* @__PURE__ */ jsx5("img", { src: source.image, alt: source.name, className: "hsk-source-img" }),
        /* @__PURE__ */ jsxs4("div", { style: { flex: 1, minWidth: 0, position: "relative" }, children: [
          isReferenced && /* @__PURE__ */ jsx5("div", { className: "hsk-cb-source-ref-badge", title: "Featured in response", style: { top: "0", right: "0" }, children: /* @__PURE__ */ jsx5(SparkleIcon, {}) }),
          /* @__PURE__ */ jsx5("div", { className: "hsk-source-name", style: { paddingRight: isReferenced ? "20px" : void 0 }, children: source.name }),
          source.price && /* @__PURE__ */ jsxs4("div", { className: "hsk-source-price", children: [
            source.currency ?? defaultCurrency,
            " ",
            source.price
          ] })
        ] })
      ]
    }
  );
}
function ChatWidget({
  title = "AI Shopping Assistant",
  placeholder = "Ask about anything in our store\u2026",
  emptyStateText = "Ask me anything about our products",
  emptyStateSuggestions = '"Find me headphones under KSh 5,000" \xB7 "Gift ideas"',
  defaultCurrency = "KES",
  className,
  theme,
  classNames = {},
  onSelectSource,
  enableVoice = false,
  enableVision = false,
  visionCategoryHint
}) {
  const { messages, sources, referencedIds, loading: chatLoading, streaming, error, send, reset } = useKiku();
  const [input, setInput] = useState4("");
  const [visualLoading, setVisualLoading] = useState4(false);
  const bottomRef = useRef4(null);
  const textareaRef = useRef4(null);
  const loading = chatLoading || visualLoading;
  const [chatHistory, setChatHistory] = useState4([]);
  const lastSyncedCount = useRef4(0);
  useEffect2(() => {
    if (messages.length === 0) {
      setChatHistory([]);
      lastSyncedCount.current = 0;
      return;
    }
    if (messages.length > lastSyncedCount.current) {
      const newMsgs = messages.slice(lastSyncedCount.current);
      setChatHistory((prev) => [...prev, ...newMsgs]);
      lastSyncedCount.current = messages.length;
    } else if (messages.length < lastSyncedCount.current) {
      setChatHistory(messages);
      lastSyncedCount.current = messages.length;
    } else {
      setChatHistory((prev) => {
        const next = [...prev];
        let hookIdx = messages.length - 1;
        let historyIdx = next.length - 1;
        while (hookIdx >= 0 && historyIdx >= 0) {
          if (next[historyIdx].role === messages[hookIdx].role) {
            next[historyIdx] = {
              ...next[historyIdx],
              content: messages[hookIdx].content,
              cartSnapshot: messages[hookIdx].cartSnapshot,
              actionType: messages[hookIdx].actionType
            };
            break;
          }
          historyIdx--;
        }
        return next;
      });
    }
  }, [messages]);
  useEffect2(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, loading]);
  const handleSend = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await send(q);
  };
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleInput = (e) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 120) + "px";
  };
  const handleVisualResults = (res, preview) => {
    const userMsg = {
      role: "user",
      content: "Uploaded a photo for visual search",
      imagePreview: preview
    };
    const dna = res.style_dna;
    let content = `I've analyzed your image! Here is the Style DNA I found:
`;
    if (dna) {
      if (dna.color_palette) content += `* **Palette:** ${dna.color_palette}
`;
      if (dna.dominant_colors && dna.dominant_colors.length > 0) {
        content += `* **Colors:** ${dna.dominant_colors.join(", ")}
`;
      }
      if (dna.aesthetic && dna.aesthetic.length > 0) {
        content += `* **Aesthetic:** ${dna.aesthetic.join(", ")}
`;
      }
      if (dna.texture) content += `* **Texture:** ${dna.texture}
`;
      if (dna.formality) content += `* **Formality:** ${dna.formality}
`;
    }
    const results = res.results || [];
    if (results.length > 0) {
      content += `
I found ${results.length} matching products in the store for you.`;
    } else {
      content += `
I couldn't find any matching products in the store.`;
    }
    const assistantMsg = {
      role: "assistant",
      content,
      styleDNA: dna,
      visualSources: results.map((r) => ({
        id: r.id,
        name: r.product.name,
        price: r.product.price,
        currency: r.product.currency,
        category: r.product.category,
        url: r.product.url,
        image: r.product.images && r.product.images.length > 0 ? r.product.images[0] : void 0,
        brand: r.product.brand
      }))
    };
    setChatHistory((prev) => [...prev, userMsg, assistantMsg]);
  };
  const customStyles = {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  };
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: cn("hsk-chat-widget", classNames.root, className),
      style: customStyles,
      children: [
        /* @__PURE__ */ jsxs4("div", { className: cn("hsk-chat-header", classNames.header), children: [
          /* @__PURE__ */ jsx5("span", { className: "hsk-chat-header-icon", children: /* @__PURE__ */ jsx5(SparkleIcon, {}) }),
          /* @__PURE__ */ jsx5("span", { className: "hsk-chat-title", children: title }),
          /* @__PURE__ */ jsx5("span", { className: "hsk-chat-badge", children: "AI" }),
          chatHistory.length > 0 && /* @__PURE__ */ jsx5("button", { className: "hsk-chat-reset", onClick: reset, style: { marginLeft: "auto" }, children: "Clear" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "hsk-chat-messages", children: [
          chatHistory.length === 0 ? /* @__PURE__ */ jsxs4("div", { className: "hsk-chat-empty", children: [
            /* @__PURE__ */ jsx5("div", { className: "hsk-chat-empty-icon", children: /* @__PURE__ */ jsx5(SparkleIcon, {}) }),
            /* @__PURE__ */ jsx5("div", { children: emptyStateText }),
            /* @__PURE__ */ jsx5("div", { className: "hsk-chat-empty-suggestions", children: emptyStateSuggestions })
          ] }) : chatHistory.map((msg, idx) => /* @__PURE__ */ jsxs4("div", { children: [
            /* @__PURE__ */ jsxs4("div", { className: `hsk-msg-row ${msg.role}`, children: [
              /* @__PURE__ */ jsx5("div", { className: cn("hsk-msg-avatar", msg.role === "assistant" ? "ai" : "user"), children: msg.role === "assistant" ? /* @__PURE__ */ jsx5(SparkleIcon, {}) : "U" }),
              /* @__PURE__ */ jsxs4("div", { className: cn("hsk-msg-bubble", msg.role, classNames.messageBubble), children: [
                msg.imagePreview && /* @__PURE__ */ jsx5("div", { className: "kiku-vs-preview-bubble", style: { marginBottom: "8px" }, children: /* @__PURE__ */ jsx5("img", { src: msg.imagePreview, alt: "Uploaded Preview", className: "kiku-vs-preview-bubble-img", style: { maxWidth: "200px", borderRadius: "8px" } }) }),
                renderMarkdown(msg.content),
                msg.styleDNA && /* @__PURE__ */ jsxs4("div", { className: "kiku-vs-preview-banner", style: { marginTop: "10px" }, children: [
                  chatHistory[idx - 1]?.imagePreview && /* @__PURE__ */ jsx5("img", { src: chatHistory[idx - 1].imagePreview, alt: "Visual Search Input", className: "kiku-vs-preview-img" }),
                  /* @__PURE__ */ jsxs4("div", { className: "kiku-vs-preview-info", children: [
                    /* @__PURE__ */ jsx5("div", { className: "kiku-vs-preview-label", children: "Visual Match Palette" }),
                    /* @__PURE__ */ jsx5("div", { className: "kiku-vs-preview-palette", children: msg.styleDNA.color_palette || "Detected Style DNA" }),
                    msg.styleDNA.style_tags && msg.styleDNA.style_tags.length > 0 && /* @__PURE__ */ jsx5("div", { className: "kiku-style-tags", children: msg.styleDNA.style_tags.map((tag, ti) => /* @__PURE__ */ jsxs4("span", { className: "kiku-style-tag", children: [
                      "#",
                      tag
                    ] }, ti)) })
                  ] })
                ] })
              ] })
            ] }),
            msg.role === "assistant" && msg.visualSources && msg.visualSources.length > 0 && /* @__PURE__ */ jsx5("div", { className: "hsk-sources-container", children: /* @__PURE__ */ jsx5("div", { className: "hsk-sources", children: msg.visualSources.map((src, si) => /* @__PURE__ */ jsx5(SourceCard, { source: src, defaultCurrency, onSelect: onSelectSource }, si)) }) }),
            msg.role === "assistant" && idx === chatHistory.length - 1 && !msg.visualSources && sources.length > 0 && (() => {
              const isStreamingActive = chatLoading || streaming;
              if (isStreamingActive) {
                return /* @__PURE__ */ jsx5("div", { className: "hsk-sources-container", children: /* @__PURE__ */ jsx5("div", { className: "hsk-sources", children: sources.map((src, si) => {
                  const isReferenced = !!(src.id && referencedIds.includes(src.id));
                  return /* @__PURE__ */ jsx5(
                    SourceCard,
                    {
                      source: src,
                      defaultCurrency,
                      onSelect: onSelectSource,
                      isReferenced
                    },
                    si
                  );
                }) }) });
              }
              const featured = sources.filter((src) => src.id && referencedIds.includes(src.id));
              const general = sources.filter((src) => !src.id || !referencedIds.includes(src.id));
              return /* @__PURE__ */ jsxs4("div", { className: "hsk-sources-container", children: [
                featured.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "hsk-sources-group", style: { marginBottom: "10px" }, children: [
                  /* @__PURE__ */ jsx5("div", { className: "hsk-sources-group-title", children: "\u2B50 Featured in response" }),
                  /* @__PURE__ */ jsx5("div", { className: "hsk-sources", children: featured.map((src, si) => /* @__PURE__ */ jsx5(
                    SourceCard,
                    {
                      source: src,
                      defaultCurrency,
                      onSelect: onSelectSource,
                      isReferenced: true
                    },
                    `feat-${si}`
                  )) })
                ] }),
                general.length > 0 && /* @__PURE__ */ jsxs4("div", { className: "hsk-sources-group", children: [
                  featured.length > 0 && /* @__PURE__ */ jsx5("div", { className: "hsk-sources-group-title", children: "All matches" }),
                  /* @__PURE__ */ jsx5("div", { className: "hsk-sources", children: general.map((src, si) => /* @__PURE__ */ jsx5(
                    SourceCard,
                    {
                      source: src,
                      defaultCurrency,
                      onSelect: onSelectSource,
                      isReferenced: false
                    },
                    `gen-${si}`
                  )) })
                ] })
              ] });
            })()
          ] }, idx)),
          loading && /* @__PURE__ */ jsxs4("div", { className: "hsk-msg-row", children: [
            /* @__PURE__ */ jsx5("div", { className: "hsk-msg-avatar ai", children: /* @__PURE__ */ jsx5(SparkleIcon, {}) }),
            /* @__PURE__ */ jsxs4("div", { className: "hsk-pending", role: "status", "aria-live": "polite", children: [
              /* @__PURE__ */ jsxs4("div", { className: "hsk-pending-glyph", children: [
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-ring" }),
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-dot" })
              ] }),
              /* @__PURE__ */ jsxs4("div", { className: "hsk-pending-text", children: [
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-step step-1", children: "Searching catalog" }),
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-step step-2", children: "Reasoning" }),
                /* @__PURE__ */ jsx5("span", { className: "hsk-pending-step step-3", children: "Composing" })
              ] })
            ] })
          ] }),
          error && /* @__PURE__ */ jsx5("div", { className: "hsk-chat-error", children: (() => {
            try {
              const parsed = JSON.parse(error);
              return parsed.error || parsed.message || error;
            } catch {
              return error;
            }
          })() }),
          /* @__PURE__ */ jsx5("div", { ref: bottomRef })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "hsk-chat-input-area", style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
          enableVision && /* @__PURE__ */ jsx5(
            VisualSearch,
            {
              onResults: handleVisualResults,
              onError: (err) => console.error("[VisualSearch] error:", err),
              categoryHint: visionCategoryHint,
              disabled: loading
            }
          ),
          /* @__PURE__ */ jsx5(
            "textarea",
            {
              ref: textareaRef,
              className: cn("hsk-chat-input", classNames.input),
              value: input,
              onChange: handleInput,
              onKeyDown: handleKey,
              placeholder,
              rows: 1,
              disabled: loading,
              style: { flex: 1 }
            }
          ),
          enableVoice && /* @__PURE__ */ jsx5(
            VoiceButton,
            {
              onTranscript: (text) => {
                setInput(text);
                send(text);
                setInput("");
              },
              onInterim: (text) => setInput(text),
              disabled: loading
            }
          ),
          /* @__PURE__ */ jsx5(
            "button",
            {
              className: "hsk-chat-send",
              onClick: handleSend,
              disabled: !input.trim() || loading,
              "aria-label": "Send message",
              children: /* @__PURE__ */ jsx5(ArrowUpIcon, {})
            }
          )
        ] })
      ]
    }
  );
}

// src/components/KikuButton.tsx
import { useState as useState5, useEffect as useEffect3, useRef as useRef5, useCallback as useCallback2 } from "react";
import { createPortal } from "react-dom";
import { useKiku as useKiku2 } from "@akropolys/sdk";
import { usePaymentPolling } from "@akropolys/sdk";
import { useAkropolysContext as useAkropolysContext3 } from "@akropolys/sdk";

// src/components/ComparisonMatrix.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function extractSize(p) {
  const name = p.name;
  const cat = (p.category || "").toLowerCase();
  const mExplicit = name.match(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|["'″])/i);
  if (mExplicit) {
    return `${mExplicit[1]} inches`;
  }
  if (cat.includes("tv") || cat.includes("audio")) {
    const mTv = name.match(/\b(\d{2})(?:[a-zA-Z]|\b)/);
    if (mTv) {
      const size = parseInt(mTv[1], 10);
      if (size >= 24 && size <= 120) {
        return `${size} inches`;
      }
    }
  }
  return null;
}
function extractResolution(name) {
  if (/\b4K\b/i.test(name)) return "4K Ultra HD (2160p)";
  if (/\bUHD\b/i.test(name)) return "Ultra HD (2160p)";
  if (/\b(?:Full HD|FHD|1080p)\b/i.test(name)) return "Full HD (1080p)";
  if (/\b(?:HD|720p)\b/i.test(name)) return "HD (720p)";
  return null;
}
function extractStorage(name) {
  const m = name.match(/(\d+)\s*GB(?!\s*RAM)/i);
  return m ? `${m[1]} GB` : null;
}
function extractRAM(name) {
  const m = name.match(/(\d+)\s*GB\s*RAM/i);
  return m ? `${m[1]} GB` : null;
}
function extractCamera(name) {
  const m = name.match(/(\d+)\s*MP/i);
  return m ? `${m[1]} MP` : null;
}
function extractBattery(name) {
  const m = name.match(/(\d{3,5})\s*mAh/i);
  return m ? `${m[1]} mAh` : null;
}
function buildRows(products, currency) {
  const rows = [];
  rows.push({
    label: "Product Preview",
    values: products.map((s) => s.image || null),
    type: "image"
  });
  const prices = products.map((s) => {
    const n = parseFloat(String(s.price ?? "").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  });
  const priceLabels = products.map((s, i) => {
    const c = s.currency || currency;
    const n = prices[i];
    return n !== null ? `${c} ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  });
  const validPrices = prices.filter((p) => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;
  rows.push({
    label: "Price",
    values: priceLabels,
    type: "price",
    bestIdx: minPrice !== null ? prices.indexOf(minPrice) : void 0
  });
  const brands = products.map((s) => s.brand || null);
  if (brands.some(Boolean)) rows.push({ label: "Brand", values: brands });
  const specDefs = [
    { label: "Display Size", fn: extractSize },
    { label: "Resolution", fn: (p) => extractResolution(p.name), higherIsBetter: true },
    { label: "Storage", fn: (p) => extractStorage(p.name), higherIsBetter: true },
    { label: "RAM", fn: (p) => extractRAM(p.name), higherIsBetter: true },
    { label: "Camera", fn: (p) => extractCamera(p.name), higherIsBetter: true },
    { label: "Battery", fn: (p) => extractBattery(p.name), higherIsBetter: true }
  ];
  const resOrder = ["4K Ultra HD (2160p)", "Ultra HD (2160p)", "Full HD (1080p)", "HD (720p)"];
  for (const { label, fn, higherIsBetter } of specDefs) {
    const vals = products.map((s) => fn(s));
    if (!vals.some(Boolean)) continue;
    let bestIdx;
    if (higherIsBetter && vals.filter(Boolean).length > 1) {
      if (label === "Resolution") {
        bestIdx = vals.reduce((best, v, i) => {
          const rank = resOrder.indexOf(v ?? "");
          const bestRank = resOrder.indexOf(vals[best] ?? "");
          return rank !== -1 && (bestRank === -1 || rank < bestRank) ? i : best;
        }, 0);
      } else {
        const nums = vals.map((v) => parseFloat((v ?? "").replace(/[^0-9.]/g, "")));
        const max = Math.max(...nums.filter((n) => !isNaN(n)));
        bestIdx = nums.indexOf(max);
      }
    }
    rows.push({ label, values: vals, bestIdx });
  }
  const avail = products.map((s) => {
    const a = s.availability ?? "";
    if (!a) return null;
    if (/in.?stock/i.test(a)) return "In-Stock";
    if (/out.?of.?stock/i.test(a)) return "Out of Stock";
    return a;
  });
  if (avail.some(Boolean)) {
    rows.push({ label: "Availability", values: avail, type: "availability" });
  }
  const cats = products.map((s) => s.category || null);
  if (cats.some(Boolean)) rows.push({ label: "Category", values: cats });
  return rows;
}
function ImageCell({ value, name }) {
  if (!value) {
    return /* @__PURE__ */ jsx6("div", { style: { fontSize: 28, textAlign: "center" }, children: "\u{1F4E6}" });
  }
  return /* @__PURE__ */ jsx6(
    "img",
    {
      src: value,
      alt: name,
      style: {
        width: 72,
        height: 72,
        objectFit: "contain",
        borderRadius: 8,
        background: "#f5f5f5",
        display: "block"
      }
    }
  );
}
function AvailabilityCell({ value }) {
  if (!value) return /* @__PURE__ */ jsx6("span", { style: { color: "#9ca3af" }, children: "\u2014" });
  const inStock = /in.?stock/i.test(value);
  return /* @__PURE__ */ jsxs5("span", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--hsk-text, #111827)" }, children: [
    /* @__PURE__ */ jsx6("span", { style: {
      width: 8,
      height: 8,
      borderRadius: "50%",
      flexShrink: 0,
      background: inStock ? "#22c55e" : "#ef4444",
      boxShadow: inStock ? "0 0 0 3px rgba(34,197,94,0.2)" : "0 0 0 3px rgba(239,68,68,0.2)",
      display: "inline-block"
    } }),
    value
  ] });
}
function ComparisonMatrix({ sources, defaultCurrency = "KES" }) {
  if (sources.length < 2) return null;
  const products = sources.slice(0, 3);
  const rows = buildRows(products, defaultCurrency);
  const colTemplate = `140px repeat(${products.length}, 1fr)`;
  const labelStyle = {
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 700,
    // Solid dark fallback — never inherit a muted ancestor color
    color: "var(--hsk-text-muted, #4b5563)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid var(--hsk-border, rgba(0,0,0,0.07))",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center"
  };
  const cellBase = {
    padding: "10px 14px",
    fontSize: 13,
    // Explicit color so cells are always readable regardless of parent theme
    color: "var(--hsk-text, #111827)",
    borderBottom: "1px solid var(--hsk-border, rgba(0,0,0,0.07))",
    verticalAlign: "middle",
    display: "flex",
    alignItems: "center"
  };
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      className: "hsk-compare-matrix",
      style: {
        marginTop: 10,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--hsk-border, rgba(0,0,0,0.09))",
        background: "var(--hsk-surface, #fff)",
        fontSize: 13
      },
      children: [
        /* @__PURE__ */ jsxs5("div", { style: { display: "grid", gridTemplateColumns: colTemplate, background: "var(--hsk-surface2, #f9fafb)", borderBottom: "2px solid var(--hsk-border, rgba(0,0,0,0.09))" }, children: [
          /* @__PURE__ */ jsx6("div", { style: { ...labelStyle, borderBottom: "none", color: "var(--hsk-text, #111)", fontSize: 12 }, children: "Feature" }),
          products.map((p, i) => /* @__PURE__ */ jsx6(
            "a",
            {
              href: p.url || "#",
              target: "_blank",
              rel: "noopener noreferrer",
              style: {
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--hsk-primary, #16a34a)",
                textDecoration: "none",
                lineHeight: 1.3,
                borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none"
              },
              children: p.name
            },
            i
          ))
        ] }),
        rows.map((row, rowIdx) => /* @__PURE__ */ jsxs5(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: colTemplate,
              background: rowIdx % 2 === 1 ? "var(--hsk-surface2, rgba(0,0,0,0.015))" : "transparent"
            },
            children: [
              /* @__PURE__ */ jsx6("div", { style: labelStyle, children: row.label }),
              products.map((p, i) => {
                const val = row.values[i];
                const isBest = row.bestIdx === i && row.values.filter(Boolean).length > 1;
                if (row.type === "image") {
                  return /* @__PURE__ */ jsx6("div", { style: { ...cellBase, justifyContent: "center", padding: "12px", borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none" }, children: /* @__PURE__ */ jsx6(ImageCell, { value: val, name: p.name }) }, i);
                }
                if (row.type === "availability") {
                  return /* @__PURE__ */ jsx6("div", { style: { ...cellBase, borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none" }, children: /* @__PURE__ */ jsx6(AvailabilityCell, { value: val }) }, i);
                }
                return /* @__PURE__ */ jsx6(
                  "div",
                  {
                    style: {
                      ...cellBase,
                      fontWeight: isBest ? 700 : 400,
                      // Always use a solid dark fallback — never 'inherit' which can be muted/invisible
                      color: isBest ? "var(--hsk-primary, #ea580c)" : row.type === "price" ? "var(--hsk-text, #374151)" : "var(--hsk-text, #111827)",
                      borderLeft: i > 0 ? "1px solid var(--hsk-border, rgba(0,0,0,0.07))" : "none"
                    },
                    children: val ?? /* @__PURE__ */ jsx6("span", { style: { color: "#9ca3af" }, children: "\u2014" })
                  },
                  i
                );
              })
            ]
          },
          rowIdx
        ))
      ]
    }
  );
}

// src/components/KikuButton.tsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
var AkropolysAIcon = ({ className, size = 18 }) => /* @__PURE__ */ jsxs6(
  "svg",
  {
    className: cn("hsk-brand-a", className),
    width: size,
    height: size,
    viewBox: "0 0 28 30",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-label": "Akropolys",
    children: [
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M14.5 4.5 L6.5 25",
          stroke: "currentColor",
          strokeWidth: "2.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M14.5 4.5 L22.5 25",
          stroke: "currentColor",
          strokeWidth: "4.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M9.5 17 H19.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M3 25 H10",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M19 25 H26",
          stroke: "currentColor",
          strokeWidth: "2.5",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx7(
        "path",
        {
          d: "M8.5 2.5 C10 2.5, 11 3.5, 11 5 C11 7, 8.5 8.5, 7.5 9.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          fill: "none",
          className: "hsk-akr-breath"
        }
      )
    ]
  }
);
var SparkleIcon2 = AkropolysAIcon;
var ArrowUpIcon2 = () => /* @__PURE__ */ jsxs6("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ jsx7("path", { d: "M12 19V5" })
] });
var CloseIcon = () => /* @__PURE__ */ jsxs6("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
  /* @__PURE__ */ jsx7("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
] });
var ChevronRightIcon = () => /* @__PURE__ */ jsx7("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx7("path", { d: "m9 18 6-6-6-6" }) });
var HistoryIcon = () => /* @__PURE__ */ jsxs6("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
  /* @__PURE__ */ jsx7("path", { d: "M3 3v5h5" }),
  /* @__PURE__ */ jsx7("path", { d: "M12 7v5l4 2" })
] });
var NewChatIcon = () => /* @__PURE__ */ jsx7("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx7("path", { d: "M12 5v14M5 12h14" }) });
var ShoppingBagIcon = () => /* @__PURE__ */ jsxs6("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" }),
  /* @__PURE__ */ jsx7("line", { x1: "3", y1: "6", x2: "21", y2: "6" }),
  /* @__PURE__ */ jsx7("path", { d: "M16 10a4 4 0 0 1-8 0" })
] });
var PaperclipIcon = () => /* @__PURE__ */ jsx7("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx7("path", { d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" }) });
var MicIcon2 = () => /* @__PURE__ */ jsxs6("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" }),
  /* @__PURE__ */ jsx7("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
  /* @__PURE__ */ jsx7("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
] });
var MicOffIcon = () => /* @__PURE__ */ jsxs6("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx7("line", { x1: "2", y1: "2", x2: "22", y2: "22" }),
  /* @__PURE__ */ jsx7("path", { d: "M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" }),
  /* @__PURE__ */ jsx7("path", { d: "M5 10v2a7 7 0 0 0 12 5" }),
  /* @__PURE__ */ jsx7("path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33" }),
  /* @__PURE__ */ jsx7("path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12" }),
  /* @__PURE__ */ jsx7("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
] });
var DEFAULT_CHIPS = [
  "Cheapest smartphone",
  "Smart TV under KSh 20,000",
  "Noise-cancelling headphones",
  "Best laptop for students"
];
var SESSIONS_KEY = "akropolys_chat_sessions";
var MAX_SESSIONS = 20;
function loadSessions() {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveSessions(sessions) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
  }
}
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
function CartContextCard({ cart, defaultCurrency }) {
  if (!cart.items || cart.items.length === 0) return null;
  const currency = cart.currency || defaultCurrency;
  const total = cart.total ?? cart.items.reduce((s, i) => s + i.price_numeric * i.quantity, 0);
  return /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-card", children: [
    /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-card-header", children: [
      /* @__PURE__ */ jsx7(ShoppingBagIcon, {}),
      /* @__PURE__ */ jsxs6("span", { children: [
        "Your cart \xB7 ",
        cart.item_count ?? cart.items.length,
        " item",
        (cart.item_count ?? cart.items.length) !== 1 ? "s" : ""
      ] })
    ] }),
    /* @__PURE__ */ jsx7("div", { className: "hsk-cart-items", children: cart.items.map((item) => /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-item", children: [
      /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-item-img-wrap", children: [
        item.image ? /* @__PURE__ */ jsx7("img", { className: "hsk-cart-item-img", src: item.image, alt: item.name, loading: "lazy" }) : /* @__PURE__ */ jsx7("div", { className: "hsk-cart-item-img-placeholder", children: /* @__PURE__ */ jsx7(ShoppingBagIcon, {}) }),
        item.quantity > 1 && /* @__PURE__ */ jsx7("span", { className: "hsk-cart-item-qty", children: item.quantity })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-item-info", children: [
        /* @__PURE__ */ jsx7("div", { className: "hsk-cart-item-name", children: item.name }),
        /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-item-price", children: [
          item.quantity > 1 && /* @__PURE__ */ jsxs6("span", { className: "hsk-cart-item-qty-label", children: [
            item.quantity,
            "\xD7 "
          ] }),
          currency,
          " ",
          (item.price_numeric * item.quantity).toLocaleString()
        ] })
      ] })
    ] }, item.id)) }),
    /* @__PURE__ */ jsxs6("div", { className: "hsk-cart-total", children: [
      /* @__PURE__ */ jsx7("span", { children: "Total" }),
      /* @__PURE__ */ jsxs6("span", { className: "hsk-cart-total-amount", children: [
        currency,
        " ",
        total.toLocaleString()
      ] })
    ] })
  ] });
}
function ActionPills({ cart, actionType, onSend, loading }) {
  const hasItems = cart.items && cart.items.length > 0;
  const lastItem = hasItems ? cart.items[cart.items.length - 1] : null;
  const pills = [];
  if (hasItems && lastItem) {
    if (actionType === "add_to_cart") {
      const name = lastItem.name || "item";
      const shortName = name.split(" ")[0] || "item";
      pills.push({ emoji: "\u2795", label: "Add 1 more", query: `Add one more ${name} to my cart` });
      pills.push({ emoji: "\u{1F5D1}\uFE0F", label: `Remove ${shortName}`, query: `Remove the ${name} from my cart` });
    }
    if (cart.items.length > 1) {
      pills.push({ emoji: "\u{1F6D2}", label: "View cart", query: "Show me my cart" });
    }
    pills.push({ emoji: "\u{1F4B3}", label: "Checkout", query: "Proceed to checkout" });
    pills.push({ emoji: "\u{1F6CD}\uFE0F", label: "Keep shopping", query: "What else do you recommend?" });
  } else if (actionType === "clear_cart" || actionType === "remove_from_cart") {
    pills.push({ emoji: "\u{1F6CD}\uFE0F", label: "Continue shopping", query: "Show me popular products" });
    pills.push({ emoji: "\u{1F50D}", label: "Search again", query: "Help me find something" });
  } else if (actionType === "view_cart") {
    if (hasItems) {
      pills.push({ emoji: "\u{1F4B3}", label: "Checkout", query: "Proceed to checkout" });
      pills.push({ emoji: "\u{1F5D1}\uFE0F", label: "Clear cart", query: "Clear my cart" });
    }
  }
  if (pills.length === 0) return null;
  return /* @__PURE__ */ jsx7("div", { className: "hsk-action-pills", children: pills.map((pill) => /* @__PURE__ */ jsxs6(
    "button",
    {
      className: "hsk-action-pill",
      onClick: () => onSend(pill.query),
      disabled: loading,
      children: [
        /* @__PURE__ */ jsx7("span", { className: "hsk-pill-emoji", children: pill.emoji }),
        pill.label
      ]
    },
    pill.query
  )) });
}
function SourcesCarousel({ sources, defaultCurrency, onSelectSource, referencedIds = [] }) {
  const client = useAkropolysContext3();
  const isProperty = client?.vertical === "property";
  const railRef = useRef5(null);
  const [showNext, setShowNext] = useState5(false);
  const measure = useCallback2(() => {
    const el = railRef.current;
    if (!el) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setShowNext(el.scrollWidth > el.clientWidth + 4 && !atEnd);
  }, []);
  useEffect3(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure, sources]);
  const scrollNext = () => {
    railRef.current?.scrollBy({ left: 170, behavior: "smooth" });
  };
  return /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-sources-wrap", children: [
    /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sources", ref: railRef, children: sources.map((src, si) => {
      const isReferenced = !!(src.id && referencedIds.includes(src.id));
      return /* @__PURE__ */ jsxs6(
        "div",
        {
          className: cn("hsk-cb-source", isReferenced && "hsk-cb-source--referenced"),
          style: { animationDelay: `${si * 50}ms` },
          onClick: () => onSelectSource?.(src),
          children: [
            src.image ? /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-src-imgwrap", style: { position: "relative" }, children: [
              /* @__PURE__ */ jsx7("img", { src: src.image, alt: src.name, loading: "lazy" }),
              isReferenced && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-source-ref-badge", title: "Featured in response", children: /* @__PURE__ */ jsx7(SparkleIcon2, { size: 10 }) }),
              isProperty && /* @__PURE__ */ jsx7("div", { style: {
                position: "absolute",
                top: "6px",
                right: "6px",
                background: "rgba(14, 14, 15, 0.75)",
                backdropFilter: "blur(4px)",
                borderRadius: "50%",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fbbf24",
                // Gold sparkle badge
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
              }, children: /* @__PURE__ */ jsx7(SparkleIcon2, { size: 12 }) })
            ] }) : /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-src-imgwrap-empty", style: { position: "relative" }, children: [
              /* @__PURE__ */ jsx7(SparkleIcon2, {}),
              isReferenced && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-source-ref-badge", title: "Featured in response", children: /* @__PURE__ */ jsx7(SparkleIcon2, { size: 10 }) })
            ] }),
            /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-src-info", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-src-name", children: src.name }),
              src.price && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-src-price", children: [
                src.currency ?? defaultCurrency,
                " ",
                parseFloat(String(src.price).replace(/[^0-9.]/g, "") || "0").toLocaleString()
              ] })
            ] })
          ]
        },
        si
      );
    }) }),
    showNext && /* @__PURE__ */ jsxs6(Fragment3, { children: [
      /* @__PURE__ */ jsx7(
        "div",
        {
          className: "hsk-cb-sources-fade",
          style: { background: "linear-gradient(to right, transparent, var(--hsk-fade-bg, #0e0e0f))" }
        }
      ),
      /* @__PURE__ */ jsx7("button", { className: "hsk-cb-sources-next", onClick: scrollNext, "aria-label": "See more", children: /* @__PURE__ */ jsx7(ChevronRightIcon, {}) })
    ] })
  ] });
}
function stripMarkdownTables(content) {
  const lines = content.split("\n");
  const out = [];
  for (const line of lines) {
    if (line.trim().startsWith("|")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function SmartContextPills({
  intent,
  sources,
  onSend,
  loading
}) {
  const client = useAkropolysContext3();
  const isProperty = client?.vertical === "property";
  if (!intent) return null;
  const pills = [];
  const cheapest = sources.length > 0 ? sources.reduce((min, s) => {
    const p = parseFloat(String(s.price ?? "").replace(/[^0-9.]/g, ""));
    const m = parseFloat(String(min.price ?? "").replace(/[^0-9.]/g, ""));
    return !isNaN(p) && (isNaN(m) || p < m) ? s : min;
  }, sources[0]) : null;
  const firstName = sources[0]?.name ?? "";
  const firstTwo = sources.slice(0, 2).map((s) => s.name);
  if (intent === "search" && sources.length > 0) {
    if (firstTwo.length >= 2) {
      pills.push({
        emoji: "\u2696\uFE0F",
        label: "Compare top 2",
        query: `Compare the ${firstTwo[0]} and ${firstTwo[1]}`
      });
    }
    if (cheapest && !isProperty) {
      const name = cheapest.name || "";
      const short = name.split(" ").slice(0, 3).join(" ");
      pills.push({
        emoji: "\u{1F6D2}",
        label: `Add ${short}`,
        query: `Add the ${name} to my cart`
      });
    }
    if (isProperty) {
      pills.push({ emoji: "\u{1F4B0}", label: "Under KSh 5M", query: "Show me options under KSh 5,000,000" });
    } else {
      pills.push({ emoji: "\u{1F4B0}", label: "Under KSh 20K", query: "Show me options under KSh 20,000" });
    }
  } else if (intent === "compare" && sources.length > 0) {
    if (cheapest && !isProperty) {
      const name = cheapest.name || "";
      const short = name.split(" ").slice(0, 3).join(" ");
      pills.push({
        emoji: "\u{1F6D2}",
        label: `Add ${short}`,
        query: `Add the ${name} to my cart`
      });
    }
    if (firstName) {
      pills.push({
        emoji: "\u{1F50D}",
        label: "Similar options",
        query: isProperty ? `Show me more properties similar to the ${firstName}` : `Show me more products similar to the ${firstName}`
      });
    }
    pills.push({ emoji: "\u{1F4A1}", label: "Which is best?", query: "Which one would you recommend and why?" });
  } else if (intent === "specs" && sources.length > 0) {
    if (firstName) {
      if (!isProperty) {
        pills.push({ emoji: "\u{1F6D2}", label: "Add to cart", query: `Add the ${firstName} to my cart` });
      }
      pills.push({
        emoji: "\u{1F504}",
        label: "Find alternatives",
        query: `What are good alternatives to the ${firstName}?`
      });
    }
  } else if (intent === "general") {
    if (isProperty) {
      pills.push({ emoji: "\u{1F50D}", label: "Show popular listings", query: "What are your most popular properties?" });
    } else {
      pills.push({ emoji: "\u{1F50D}", label: "Show popular items", query: "What are your most popular products?" });
    }
    pills.push({ emoji: "\u{1F4A1}", label: "Recommend something", query: "What do you recommend for me?" });
  }
  if (pills.length === 0) return null;
  return /* @__PURE__ */ jsx7("div", { className: "hsk-action-pills", children: pills.map((pill) => /* @__PURE__ */ jsxs6(
    "button",
    {
      className: "hsk-action-pill",
      onClick: () => onSend(pill.query),
      disabled: loading,
      children: [
        /* @__PURE__ */ jsx7("span", { className: "hsk-pill-emoji", children: pill.emoji }),
        pill.label
      ]
    },
    pill.query
  )) });
}
var getFriendlyError = (err) => {
  let str = "";
  if (typeof err === "string") str = err;
  else if (err && typeof err === "object" && err.message) str = err.message;
  else try {
    str = JSON.stringify(err);
  } catch {
    str = String(err);
  }
  const lower = str.toLowerCase();
  if (lower.includes("429") || lower.includes("too many requests") || lower.includes("requests per minute limit exceeded") || lower.includes("too_many_requests_error") || lower.includes("request_quota_exceeded") || lower.includes("quota")) {
    return "The assistant is currently receiving too many requests. Please try again in a few moments.";
  }
  if (lower.includes("token limit")) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }
  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};
function parseThinking(text) {
  const openMatch = text.match(/<\s*thinking\s*>/i);
  if (!openMatch) {
    return { thinking: "", content: text, isComplete: true };
  }
  const openIdx = openMatch.index ?? 0;
  const openTagLength = openMatch[0].length;
  const start = openIdx + openTagLength;
  const contentBefore = text.slice(0, openIdx);
  const textAfterOpen = text.slice(start);
  const closeMatch = textAfterOpen.match(/<\/\s*thinking\s*>/i);
  if (!closeMatch) {
    return {
      thinking: textAfterOpen,
      content: contentBefore,
      isComplete: false
    };
  }
  const closeIdx = closeMatch.index ?? 0;
  const closeTagLength = closeMatch[0].length;
  return {
    thinking: textAfterOpen.slice(0, closeIdx),
    content: contentBefore + textAfterOpen.slice(closeIdx + closeTagLength),
    isComplete: true
  };
}
function ThinkingBlock({ text, isComplete }) {
  const [isOpen, setIsOpen] = useState5(true);
  useEffect3(() => {
    if (!isComplete) {
      setIsOpen(true);
    }
  }, [isComplete]);
  return /* @__PURE__ */ jsxs6("div", { style: {
    marginBottom: "12px",
    borderLeft: "2px solid #e4e4e7",
    paddingLeft: "10px",
    fontSize: "0.825rem",
    backgroundColor: "rgba(244, 244, 245, 0.4)",
    padding: "8px 10px",
    borderRadius: "0 6px 6px 0"
  }, children: [
    /* @__PURE__ */ jsxs6(
      "div",
      {
        onClick: () => setIsOpen(!isOpen),
        style: {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: "#71717a",
          cursor: "pointer",
          fontWeight: 500,
          userSelect: "none"
        },
        children: [
          /* @__PURE__ */ jsxs6("span", { style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
            /* @__PURE__ */ jsxs6("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", style: { animation: !isComplete ? "spin 3s linear infinite" : "none" }, children: [
              /* @__PURE__ */ jsx7("circle", { cx: "12", cy: "12", r: "10" }),
              /* @__PURE__ */ jsx7("path", { d: "M12 6v6l4 2" })
            ] }),
            "Thinking Process"
          ] }),
          !isComplete && /* @__PURE__ */ jsx7("span", { style: {
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#3b82f6",
            display: "inline-block",
            animation: "hsk-pulse 1.2s infinite ease-in-out"
          } }),
          /* @__PURE__ */ jsx7("span", { style: {
            fontSize: "0.7rem",
            marginLeft: "auto",
            transform: isOpen ? "rotate(90deg)" : "none",
            transition: "transform 0.1s"
          }, children: "\u25B6" })
        ]
      }
    ),
    isOpen && /* @__PURE__ */ jsx7("div", { style: {
      marginTop: "6px",
      color: "#52525b",
      whiteSpace: "pre-wrap",
      lineHeight: "1.4",
      fontStyle: "italic"
    }, children: text })
  ] });
}
var PROPERTY_CHIPS = [
  "3 bedroom apartments",
  "Houses under KSh 5,000,000",
  "Properties in Palm Beach",
  "Studio apartments with pool"
];
function ChatModal({
  title = "Shopping Assistant",
  placeholder = "Ask me anything \u2014 gifts, budget, use case\u2026",
  backdropColor,
  backdropBlur,
  onClose,
  onSelectSource,
  defaultCurrency = "KES",
  chips = DEFAULT_CHIPS,
  theme,
  classNames = {},
  enableVoice = false,
  enableVision = false,
  visionCategoryHint
}) {
  const client = useAkropolysContext3();
  const { messages, sources, loading, streaming, error, lastAction, lastIntent, send, reset, referencedIds } = useKiku2();
  const [input, setInput] = useState5("");
  const [attachments, setAttachments] = useState5([]);
  const imageInputRef = useRef5(null);
  const handleImageFiles = (files) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result;
        if (dataUrl) {
          setAttachments((prev) => [...prev, { type: "image", data: dataUrl }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };
  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };
  const [voiceState, setVoiceState] = useState5("idle");
  const recognitionRef = useRef5(null);
  const pendingVoiceRef = useRef5(null);
  const hasSpeechAPI = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const startVoice = useCallback2(() => {
    if (!hasSpeechAPI || voiceState !== "idle") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => setVoiceState("listening");
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      pendingVoiceRef.current = transcript;
      setVoiceState("processing");
    };
    recognition.onerror = () => setVoiceState("idle");
    recognition.onend = () => {
      setVoiceState((prev) => prev === "listening" ? "idle" : prev);
    };
    recognition.start();
  }, [hasSpeechAPI, voiceState]);
  const stopVoice = useCallback2(() => {
    recognitionRef.current?.stop();
    setVoiceState("idle");
  }, []);
  useEffect3(() => {
    return () => recognitionRef.current?.abort();
  }, []);
  const isProperty = client.vertical === "property";
  const activeChips = chips === DEFAULT_CHIPS && isProperty ? PROPERTY_CHIPS : chips;
  const activeTitle = title === "Shopping Assistant" && isProperty ? "Property Assistant" : title;
  const activePlaceholder = placeholder === "Ask me anything \u2014 gifts, budget, use case\u2026" && isProperty ? "Ask me anything \u2014 location, budget, bedrooms\u2026" : placeholder;
  const [selectedProduct, setSelectedProduct] = useState5(null);
  const bottomRef = useRef5(null);
  const textareaRef = useRef5(null);
  const [phoneInput, setPhoneInput] = useState5(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("akropolys_user_phone") || "";
    }
    return "";
  });
  const [merchantRef, setMerchantRef] = useState5(null);
  const [paymentPhase, setPaymentPhase] = useState5("idle");
  const [sessions, setSessions] = useState5(() => loadSessions());
  const [sidebarOpen, setSidebarOpen] = useState5(false);
  const [replayMessages, setReplayMessages] = useState5(null);
  const { status: pollStatus } = usePaymentPolling({
    client: client.api,
    merchantReference: merchantRef,
    onSuccess: () => {
      setPaymentPhase("done");
      setMerchantRef(null);
    },
    onFailure: () => {
      setPaymentPhase("failed");
      setMerchantRef(null);
    }
  });
  useEffect3(() => {
    if (!lastAction) return;
    if (lastAction.type === "request_phone") {
      setPaymentPhase("prompt_phone");
    } else if (lastAction.type === "awaiting_payment") {
      setMerchantRef(lastAction.merchantReference ?? null);
      setPaymentPhase("awaiting");
    }
  }, [lastAction]);
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  } : void 0;
  const handlePhoneSubmit = async () => {
    if (!phoneInput.trim()) return;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("akropolys_user_phone", phoneInput.trim());
      }
      const isHistoryIntent = lastIntent === "capture" || lastIntent === "delete" || lastIntent === "view_history";
      if (isHistoryIntent) {
        setPaymentPhase("idle");
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMsg) {
          await send(lastUserMsg.content);
        }
        return;
      }
      const res = await client.api.initiatePayment(phoneInput.trim());
      setMerchantRef(res.merchantReference);
      setPaymentPhase("awaiting");
    } catch (e) {
      console.error("[Akropolys] initiatePayment error", e);
      setPaymentPhase("failed");
    }
  };
  const msgsContainerRef = useRef5(null);
  useEffect3(() => {
    const container = msgsContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, selectedProduct]);
  useEffect3(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const saveCurrentSession = useCallback2(() => {
    if (messages.length < 2) return;
    const firstUser = messages.find((m) => m.role === "user");
    const session = {
      id: `session_${Date.now()}`,
      title: firstUser ? firstUser.content.slice(0, 60) : "Chat session",
      messages,
      ts: Date.now()
    };
    const updated = [session, ...sessions].slice(0, MAX_SESSIONS);
    setSessions(updated);
    saveSessions(updated);
  }, [messages, sessions]);
  const handleReset = useCallback2(() => {
    saveCurrentSession();
    reset();
    setReplayMessages(null);
    setPaymentPhase("idle");
    setMerchantRef(null);
  }, [reset, saveCurrentSession]);
  const handleSourceClick = (src) => {
    setSelectedProduct(src);
    onSelectSource?.(src);
    const q = `Tell me more about the ${src.name}${src.price ? ` (${src.currency ?? defaultCurrency} ${src.price})` : ""} \u2014 what are its key specs, who is it best for, and is it worth buying?`;
    send(q);
  };
  const handleSend = async (text, extraAttachments) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setReplayMessages(null);
    setSelectedProduct(null);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    const toSend = extraAttachments ?? attachments;
    setAttachments([]);
    await send(q, void 0, toSend.length > 0 ? toSend : void 0);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleInput = (e) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };
  useEffect3(() => {
    if (voiceState !== "processing") return;
    const transcript = pendingVoiceRef.current;
    if (!transcript) {
      setVoiceState("idle");
      return;
    }
    pendingVoiceRef.current = null;
    const timer = setTimeout(() => {
      setVoiceState("idle");
      handleSend(transcript);
    }, 400);
    return () => clearTimeout(timer);
  }, [voiceState]);
  const blurVal = typeof backdropBlur === "number" ? `${backdropBlur}px` : backdropBlur ?? "20px";
  const displayMessages = replayMessages ?? messages;
  const loadSession = (session) => {
    setReplayMessages(session.messages);
    setSidebarOpen(false);
  };
  const deleteSession = (id, e) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
  };
  return /* @__PURE__ */ jsx7(
    "div",
    {
      className: cn("hsk-cb-overlay", classNames.overlay),
      onClick: onClose,
      "data-hsk-theme": hskThemeAttr,
      style: {
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        ...backdropColor ? { background: backdropColor } : {},
        ...customStyles
      },
      children: /* @__PURE__ */ jsxs6("div", { className: cn("hsk-cb-panel hsk-cb-panel--with-sidebar", classNames.panel), onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxs6("div", { className: cn("hsk-cb-sidebar", sidebarOpen && "hsk-cb-sidebar--open"), children: [
          /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-sidebar-header", children: [
            /* @__PURE__ */ jsx7("span", { className: "hsk-cb-sidebar-title", children: "History" }),
            /* @__PURE__ */ jsxs6(
              "button",
              {
                className: "hsk-cb-sidebar-new",
                onClick: handleReset,
                title: "New chat",
                children: [
                  /* @__PURE__ */ jsx7(NewChatIcon, {}),
                  /* @__PURE__ */ jsx7("span", { children: "New chat" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sidebar-list", children: sessions.length === 0 ? /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-sidebar-empty", children: [
            /* @__PURE__ */ jsx7(HistoryIcon, {}),
            /* @__PURE__ */ jsx7("span", { children: "No history yet" })
          ] }) : sessions.map((session) => /* @__PURE__ */ jsxs6(
            "div",
            {
              className: cn(
                "hsk-cb-sidebar-session",
                replayMessages === session.messages && "hsk-cb-sidebar-session--active"
              ),
              onClick: () => loadSession(session),
              children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sidebar-session-title", children: session.title }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-sidebar-session-meta", children: relativeTime(session.ts) }),
                /* @__PURE__ */ jsx7(
                  "button",
                  {
                    className: "hsk-cb-sidebar-session-del",
                    onClick: (e) => deleteSession(session.id, e),
                    title: "Delete",
                    children: "\xD7"
                  }
                )
              ]
            },
            session.id
          )) })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-main", children: [
          /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-topbar", children: [
            /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-topbar-left", children: [
              /* @__PURE__ */ jsx7(
                "button",
                {
                  className: cn("hsk-cb-sidebar-toggle", sidebarOpen && "hsk-cb-sidebar-toggle--active"),
                  onClick: (e) => {
                    e.stopPropagation();
                    setSidebarOpen((v) => !v);
                  },
                  "aria-label": "Toggle history",
                  children: /* @__PURE__ */ jsx7(HistoryIcon, {})
                }
              ),
              /* @__PURE__ */ jsx7("span", { className: "hsk-cb-topbar-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon2, {}) }),
              /* @__PURE__ */ jsx7("div", { children: /* @__PURE__ */ jsx7("div", { className: "hsk-cb-topbar-title", children: activeTitle }) })
            ] }),
            /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-topbar-actions", children: [
              replayMessages ? /* @__PURE__ */ jsx7("button", { className: "hsk-cb-topbar-btn", onClick: () => {
                setReplayMessages(null);
              }, children: "\u2190 Live chat" }) : messages.length > 0 && /* @__PURE__ */ jsx7("button", { className: "hsk-cb-topbar-btn", onClick: handleReset, children: "Clear chat" }),
              /* @__PURE__ */ jsx7("button", { className: "hsk-cb-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx7(CloseIcon, {}) })
            ] })
          ] }),
          replayMessages && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-replay-banner", children: [
            /* @__PURE__ */ jsx7(HistoryIcon, {}),
            /* @__PURE__ */ jsx7("span", { children: "You're viewing a past conversation." }),
            /* @__PURE__ */ jsx7("button", { onClick: () => setReplayMessages(null), children: "Back to chat \u2192" })
          ] }),
          /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-msgs", ref: msgsContainerRef, children: [
            displayMessages.length === 0 ? /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-empty", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-empty-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon2, {}) }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-empty-title", children: "Find exactly what you need" }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-chips", children: activeChips.map((chip) => /* @__PURE__ */ jsx7(
                "button",
                {
                  className: "hsk-cb-chip",
                  onClick: () => handleSend(chip),
                  children: chip
                },
                chip
              )) })
            ] }) : displayMessages.map((msg, idx) => {
              const isLast = idx === displayMessages.length - 1 && !replayMessages;
              const isUser = msg.role === "user";
              const displayContent = !isUser && isLast && lastIntent === "compare" && sources.length >= 2 && !replayMessages ? stripMarkdownTables(msg.content) : msg.content;
              return /* @__PURE__ */ jsx7("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-user-msg", children: [
                msg.images && msg.images.length > 0 && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-user-imgs", children: msg.images.map((img, i) => /* @__PURE__ */ jsx7("img", { src: img, alt: `attachment ${i + 1}`, className: "hsk-cb-user-img-thumb" }, i)) }),
                msg.content && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-user-bubble", children: msg.content })
              ] }) : /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-ai-msg", children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon2, {}) }),
                /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-ai-body", children: [
                  (() => {
                    const { thinking, content, isComplete } = parseThinking(displayContent);
                    return /* @__PURE__ */ jsxs6(Fragment3, { children: [
                      thinking && /* @__PURE__ */ jsx7(ThinkingBlock, { text: thinking, isComplete }),
                      content && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-text", children: renderMarkdown(content) })
                    ] });
                  })(),
                  isLast && lastIntent === "compare" && sources.length >= 2 && !replayMessages && /* @__PURE__ */ jsx7(ComparisonMatrix, { sources, defaultCurrency }),
                  isLast && sources.length > 0 && lastIntent !== "compare" && lastAction?.type !== "request_phone" && lastAction?.type !== "awaiting_payment" && lastAction?.type !== "checkout" && !msg.cartSnapshot && /* @__PURE__ */ jsx7(
                    SourcesCarousel,
                    {
                      sources,
                      defaultCurrency,
                      onSelectSource: handleSourceClick,
                      referencedIds
                    }
                  ),
                  msg.cartSnapshot && msg.cartSnapshot.items?.length > 0 && /* @__PURE__ */ jsx7(
                    CartContextCard,
                    {
                      cart: msg.cartSnapshot,
                      defaultCurrency
                    }
                  ),
                  isLast && msg.cartSnapshot && !loading && /* @__PURE__ */ jsx7(
                    ActionPills,
                    {
                      cart: msg.cartSnapshot,
                      actionType: msg.actionType,
                      onSend: handleSend,
                      loading
                    }
                  ),
                  isLast && !loading && !msg.cartSnapshot && !replayMessages && /* @__PURE__ */ jsx7(
                    SmartContextPills,
                    {
                      intent: lastIntent,
                      sources,
                      onSend: handleSend,
                      loading
                    }
                  )
                ] })
              ] }) }, idx);
            }),
            selectedProduct && loading && /* @__PURE__ */ jsxs6(
              "div",
              {
                className: "hsk-cb-selected-product",
                onClick: () => selectedProduct.url && window.open(selectedProduct.url, "_blank"),
                children: [
                  selectedProduct.image && /* @__PURE__ */ jsx7("img", { className: "hsk-cb-selected-img", src: selectedProduct.image, alt: selectedProduct.name }),
                  /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-selected-info", children: [
                    /* @__PURE__ */ jsx7("div", { className: "hsk-cb-selected-name", children: selectedProduct.name }),
                    selectedProduct.price && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-selected-price", children: [
                      selectedProduct.currency ?? defaultCurrency,
                      " ",
                      parseFloat(String(selectedProduct.price ?? "").replace(/[^0-9.]/g, "") || "0").toLocaleString()
                    ] })
                  ] })
                ]
              }
            ),
            loading && !streaming && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-typing-row", style: { display: "flex", alignItems: "flex-start", gap: "10px" }, children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center", marginTop: "4px" }, children: /* @__PURE__ */ jsx7(SparkleIcon2, {}) }),
              /* @__PURE__ */ jsxs6("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
                /* @__PURE__ */ jsx7("style", { children: `
                    @keyframes hsk-pulse {
                      0%, 100% { opacity: 0.6; }
                      50% { opacity: 1; }
                    }
                  ` }),
                /* @__PURE__ */ jsx7("div", { style: { fontSize: "0.85rem", color: "#6b7280", fontStyle: "italic", animation: "hsk-pulse 1.5s infinite ease-in-out" }, children: isProperty ? "Analyzing listings..." : "Searching catalog..." }),
                /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-typing", style: { margin: 0, alignSelf: "flex-start" }, children: [
                  /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot" })
                ] })
              ] })
            ] }),
            error && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-error", children: getFriendlyError(error) }),
            !replayMessages && paymentPhase === "prompt_phone" && (() => {
              const isHistoryIntent = lastIntent === "capture" || lastIntent === "delete" || lastIntent === "view_history";
              if (isHistoryIntent) {
                return null;
              }
              return /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-ai-msg", children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon2, {}) }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-body", children: /* @__PURE__ */ jsx7("div", { className: "hsk-cb-ai-text", children: /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-phone-form", children: [
                  /* @__PURE__ */ jsx7("label", { className: "hsk-cb-phone-label", children: "Enter your M-Pesa number to pay" }),
                  /* @__PURE__ */ jsx7(
                    "input",
                    {
                      type: "tel",
                      className: "hsk-cb-phone-input",
                      placeholder: "0712 345 678",
                      value: phoneInput,
                      onChange: (e) => setPhoneInput(e.target.value.replace(/\D/g, "")),
                      onKeyDown: (e) => e.key === "Enter" && handlePhoneSubmit(),
                      autoFocus: true
                    }
                  ),
                  /* @__PURE__ */ jsx7("button", { className: "hsk-cb-phone-submit", onClick: handlePhoneSubmit, children: "Send STK push" })
                ] }) }) })
              ] });
            })(),
            !replayMessages && paymentPhase === "awaiting" && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-payment-prompt hsk-cb-payment-prompt--awaiting", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-pulse-ring" }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon-wrap", children: /* @__PURE__ */ jsx7("span", { style: { fontSize: "2rem" }, children: "\u{1F4F1}" }) }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", style: { fontWeight: 600 }, children: "Check your phone" }),
              /* @__PURE__ */ jsxs6("p", { className: "hsk-cb-payment-sub", children: [
                "An M-Pesa STK push has been sent.",
                /* @__PURE__ */ jsx7("br", {}),
                "Enter your PIN to complete payment."
              ] }),
              /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-payment-dots", children: [
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot hsk-cb-dot--amber" }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot hsk-cb-dot--amber" }),
                /* @__PURE__ */ jsx7("div", { className: "hsk-cb-dot hsk-cb-dot--amber" })
              ] })
            ] }),
            !replayMessages && paymentPhase === "done" && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-payment-prompt hsk-cb-payment-prompt--success", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-success-ring" }),
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon-wrap", children: /* @__PURE__ */ jsx7("span", { style: { fontSize: "2.5rem" }, children: "\u2705" }) }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", children: "Payment complete!" }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-sub", children: "Thank you for your order. A confirmation has been sent." })
            ] }),
            !replayMessages && paymentPhase === "failed" && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-payment-prompt hsk-cb-payment-prompt--failed", children: [
              /* @__PURE__ */ jsx7("div", { className: "hsk-cb-payment-icon-wrap", children: /* @__PURE__ */ jsx7("span", { style: { fontSize: "2.5rem" }, children: "\u274C" }) }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-label", children: "Payment failed or timed out" }),
              /* @__PURE__ */ jsx7("p", { className: "hsk-cb-payment-sub", children: "Please check your M-Pesa PIN and try again, or contact support." }),
              /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-payment-actions", children: [
                /* @__PURE__ */ jsx7(
                  "button",
                  {
                    className: "hsk-cb-pay-submit",
                    onClick: () => {
                      setPaymentPhase("prompt_phone");
                      setMerchantRef(null);
                    },
                    children: "Try again"
                  }
                ),
                /* @__PURE__ */ jsx7(
                  "button",
                  {
                    className: "hsk-cb-pay-secondary",
                    onClick: () => {
                      setPaymentPhase("idle");
                      setMerchantRef(null);
                    },
                    children: "Cancel"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx7("div", { ref: bottomRef, style: { height: 1 } })
          ] }),
          !replayMessages && /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-input-wrap", children: [
            attachments.length > 0 && /* @__PURE__ */ jsx7("div", { className: "hsk-cb-img-strip", children: attachments.map((att, i) => /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-img-thumb-wrap", children: [
              /* @__PURE__ */ jsx7("img", { src: att.data, alt: `attachment ${i + 1}`, className: "hsk-cb-img-thumb" }),
              /* @__PURE__ */ jsx7(
                "button",
                {
                  className: "hsk-cb-img-thumb-remove",
                  onClick: () => removeAttachment(i),
                  "aria-label": "Remove image",
                  children: "\xD7"
                }
              )
            ] }, i)) }),
            /* @__PURE__ */ jsxs6("div", { className: "hsk-cb-input-box", children: [
              /* @__PURE__ */ jsx7(
                "input",
                {
                  ref: imageInputRef,
                  type: "file",
                  accept: "image/*",
                  multiple: true,
                  style: { display: "none" },
                  onChange: (e) => handleImageFiles(e.target.files)
                }
              ),
              enableVision && /* @__PURE__ */ jsx7(
                "button",
                {
                  className: "hsk-cb-attach-btn",
                  onClick: () => imageInputRef.current?.click(),
                  disabled: loading,
                  "aria-label": "Attach image",
                  title: "Attach image",
                  children: /* @__PURE__ */ jsx7(PaperclipIcon, {})
                }
              ),
              /* @__PURE__ */ jsx7(
                "textarea",
                {
                  ref: textareaRef,
                  className: cn("hsk-cb-textarea", classNames.input),
                  value: input,
                  onChange: handleInput,
                  onKeyDown: handleKeyDown,
                  placeholder: activePlaceholder,
                  rows: 1,
                  disabled: loading,
                  autoFocus: true
                }
              ),
              hasSpeechAPI && enableVoice && /* @__PURE__ */ jsxs6(
                "button",
                {
                  className: cn(
                    "hsk-cb-mic-btn",
                    voiceState === "listening" && "hsk-cb-mic-btn--listening",
                    voiceState === "processing" && "hsk-cb-mic-btn--processing"
                  ),
                  onClick: voiceState === "idle" ? startVoice : stopVoice,
                  disabled: loading,
                  "aria-label": voiceState === "idle" ? "Start voice input" : "Stop recording",
                  title: voiceState === "idle" ? "Voice input" : "Stop",
                  children: [
                    voiceState === "listening" ? /* @__PURE__ */ jsx7(MicOffIcon, {}) : /* @__PURE__ */ jsx7(MicIcon2, {}),
                    voiceState === "listening" && /* @__PURE__ */ jsx7("span", { className: "hsk-cb-mic-pulse" })
                  ]
                }
              ),
              /* @__PURE__ */ jsx7(
                "button",
                {
                  className: cn("hsk-cb-send", classNames.sendButton),
                  onClick: () => handleSend(),
                  disabled: !input.trim() && attachments.length === 0 || loading,
                  "aria-label": "Send message",
                  children: /* @__PURE__ */ jsx7(ArrowUpIcon2, {})
                }
              )
            ] }),
            /* @__PURE__ */ jsx7("div", { className: "hsk-cb-hint", children: "Akropolys AI \xB7 searches the whole catalogue in real time" })
          ] })
        ] })
      ] })
    }
  );
}
function KikuButton({
  label,
  title,
  placeholder,
  backdropColor,
  backdropBlur,
  className,
  onSelectSource,
  defaultCurrency,
  chips,
  theme,
  classNames = {},
  enableVoice = false,
  enableVision = false,
  visionCategoryHint
}) {
  const [open, setOpen] = useState5(false);
  const [mounted, setMounted] = useState5(false);
  useEffect3(() => {
    setMounted(true);
    if (typeof window !== "undefined" && !window.__akropolys_nav_patched) {
      window.__akropolys_nav_patched = true;
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;
      window.history.pushState = function(...args) {
        originalPush.apply(this, args);
        window.dispatchEvent(new CustomEvent("akropolys:navigation"));
      };
      window.history.replaceState = function(...args) {
        originalReplace.apply(this, args);
        window.dispatchEvent(new CustomEvent("akropolys:navigation"));
      };
    }
    const handleNavigation = () => {
      setOpen(false);
    };
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("akropolys:navigation", handleNavigation);
    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.removeEventListener("akropolys:navigation", handleNavigation);
    };
  }, []);
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  } : void 0;
  return /* @__PURE__ */ jsxs6(Fragment3, { children: [
    /* @__PURE__ */ jsxs6(
      "button",
      {
        className: cn("hsk-cb-btn", classNames.button, className),
        onClick: () => setOpen(true),
        style: customStyles,
        "data-hsk-theme": hskThemeAttr,
        "aria-label": "Open AI chat",
        children: [
          /* @__PURE__ */ jsx7("span", { className: "hsk-cb-btn-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx7(SparkleIcon2, {}) }),
          label !== void 0 ? label : null
        ]
      }
    ),
    open && mounted && createPortal(
      /* @__PURE__ */ jsx7(
        ChatModal,
        {
          title,
          placeholder,
          backdropColor,
          backdropBlur,
          onClose: () => setOpen(false),
          onSelectSource,
          defaultCurrency,
          chips,
          theme,
          classNames,
          enableVoice,
          enableVision,
          visionCategoryHint
        }
      ),
      document.body
    )
  ] });
}

// src/components/Sparkle.tsx
import { useState as useState6, useEffect as useEffect4, useRef as useRef6 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import { useSearch as useSearch2, useKiku as useKiku3, useAkropolysContext as useAkropolysContext4 } from "@akropolys/sdk";
import { Fragment as Fragment4, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
var SparkleIcon3 = ({ className, size = 16 }) => /* @__PURE__ */ jsxs7(
  "svg",
  {
    className: cn("hsk-brand-a", className),
    width: size,
    height: size,
    viewBox: "0 0 28 30",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-label": "Akropolys",
    children: [
      /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M14.5 4.5 L6.5 25",
          stroke: "currentColor",
          strokeWidth: "2.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M14.5 4.5 L22.5 25",
          stroke: "currentColor",
          strokeWidth: "4.2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M9.5 17 H19.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M3 25 H10",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M19 25 H26",
          stroke: "currentColor",
          strokeWidth: "2.5",
          strokeLinecap: "round"
        }
      ),
      /* @__PURE__ */ jsx8(
        "path",
        {
          d: "M8.5 2.5 C10 2.5, 11 3.5, 11 5 C11 7, 8.5 8.5, 7.5 9.5",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          fill: "none",
          className: "hsk-akr-breath"
        }
      )
    ]
  }
);
var CloseIcon2 = () => /* @__PURE__ */ jsxs7("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx8("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
  /* @__PURE__ */ jsx8("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
] });
var ArrowUpIcon3 = () => /* @__PURE__ */ jsxs7("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsx8("path", { d: "m5 12 7-7 7 7" }),
  /* @__PURE__ */ jsx8("path", { d: "M12 19V5" })
] });
var getFriendlyError2 = (err) => {
  let str = "";
  if (typeof err === "string") str = err;
  else if (err && typeof err === "object" && err.message) str = err.message;
  else try {
    str = JSON.stringify(err);
  } catch {
    str = String(err);
  }
  if (str.toLowerCase().includes("token limit")) {
    return "You've reached your usage limit. Please update your billing limits in your dashboard to continue.";
  }
  try {
    const parsed = JSON.parse(str);
    return parsed.error || parsed.message || str;
  } catch {
    return str;
  }
};
function SparkleModal({
  productName,
  limit,
  backdropColor,
  backdropBlur,
  onClose,
  onNavigate,
  onResult,
  theme,
  classNames = {},
  product: initialProduct
}) {
  const client = useAkropolysContext4();
  const [fetchedProduct, setFetchedProduct] = useState6(null);
  const displayProduct = initialProduct || fetchedProduct;
  const { results, loading: searchLoading, search } = useSearch2({ type: "vector" });
  const { messages, sources, loading: chatLoading, error: chatError, send } = useKiku3();
  const [chatInput, setChatInput] = useState6("");
  const [isMobile, setIsMobile] = useState6(false);
  const [showSpecs, setShowSpecs] = useState6(false);
  const [collapseSimilar, setCollapseSimilar] = useState6(false);
  const chatBottomRef = useRef6(null);
  const chatTextareaRef = useRef6(null);
  useEffect4(() => {
    if (!initialProduct && !fetchedProduct) {
      client.api.searchVector(productName, 1).then((res) => {
        if (res.results && res.results.length > 0) {
          setFetchedProduct(res.results[0].product);
        }
      }).catch((err) => console.error("[Akropolys] Failed to fetch product details", err));
    }
    search(productName, limit);
  }, [productName, initialProduct, fetchedProduct, client, limit, search]);
  useEffect4(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);
  useEffect4(() => {
    if (results.length > 0) onResult?.(results);
  }, [results, onResult]);
  useEffect4(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  useEffect4(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);
  const blurVal = typeof backdropBlur === "number" ? `${backdropBlur}px` : backdropBlur ?? "16px";
  const bg = backdropColor ?? void 0;
  const handleNav = (r) => {
    const prevent = onNavigate?.(r);
    if (prevent !== false) {
      onClose();
      if (r.product.url) window.location.href = r.product.url;
    }
  };
  const handleSend = async (text) => {
    const q = (text ?? chatInput).trim();
    if (!q || chatLoading) return;
    setChatInput("");
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = "auto";
    }
    if (messages.length === 0 && displayProduct) {
      const contextQuery = `[Context: Shopper is viewing "${displayProduct.name}". Price: ${displayProduct.price}. Description: ${displayProduct.description || ""}]

Question: ${q}`;
      await send(contextQuery, q);
    } else {
      await send(q);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleInput = (e) => {
    setChatInput(e.target.value);
    const t = e.target;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  };
  const customStyles = {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  };
  const displayMessages = messages.length === 0 && displayProduct ? [
    {
      role: "assistant",
      content: `Hi! I can help you with **${displayProduct.name}**. Ask me about its specifications, features, compare it with other options, or find alternatives!`
    }
  ] : messages;
  if (isMobile) {
    return /* @__PURE__ */ jsx8(
      "div",
      {
        className: cn("hsk-sp-backdrop hsk-sp-mobile-view", classNames.backdrop),
        onClick: onClose,
        style: {
          backdropFilter: `blur(${blurVal})`,
          WebkitBackdropFilter: `blur(${blurVal})`,
          background: bg ?? void 0,
          ...customStyles
        },
        children: /* @__PURE__ */ jsxs7("div", { className: cn("hsk-sp-card hsk-sp-fullscreen hsk-sp-mobile-card", classNames.card), onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-header", children: [
            /* @__PURE__ */ jsx8("span", { className: "hsk-sp-header-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx8(SparkleIcon3, {}) }),
            /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-header-body", children: [
              /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-header-title-row", children: [
                /* @__PURE__ */ jsx8("div", { className: "hsk-sp-header-title", children: displayProduct?.name || productName }),
                displayProduct && /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    className: "hsk-sp-header-specs-btn",
                    onClick: () => setShowSpecs(true),
                    children: "Specs"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx8("div", { className: "hsk-sp-header-sub", children: "Akropolys AI Shopping Assistant" })
            ] }),
            /* @__PURE__ */ jsx8("button", { className: "hsk-sp-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx8(CloseIcon2, {}) })
          ] }),
          searchLoading && /* @__PURE__ */ jsx8("div", { className: "hsk-sp-bar" }),
          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-chat-container", children: [
            /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-msgs", children: [
              displayMessages.map((msg, idx) => {
                const isUser = msg.role === "user";
                return /* @__PURE__ */ jsx8("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ jsx8("div", { className: "hsk-cb-user-msg", children: /* @__PURE__ */ jsx8("div", { className: "hsk-cb-user-bubble", children: msg.content }) }) : /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-ai-msg", children: [
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx8(SparkleIcon3, {}) }),
                  /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-ai-body", children: [
                    /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-text", children: renderMarkdown(msg.content) }),
                    idx === 0 && displayProduct && /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-attachment-deck", children: [
                      /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-main-card", children: [
                        /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-main-card-img", children: displayProduct.images?.[0] ? /* @__PURE__ */ jsx8("img", { src: displayProduct.images[0], alt: displayProduct.name }) : /* @__PURE__ */ jsx8("span", { children: "\u{1F6CD}" }) }),
                        /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-main-card-info", children: [
                          /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-main-card-brand", children: displayProduct.brand || displayProduct.category || "Product" }),
                          /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-main-card-name", children: displayProduct.name }),
                          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-main-card-price", children: [
                            displayProduct.currency ?? "KES",
                            " ",
                            parseFloat(displayProduct.price?.replace(/[^0-9.]/g, "") || "0").toLocaleString()
                          ] })
                        ] }),
                        (displayProduct.specs && Object.keys(displayProduct.specs).length > 0 || displayProduct.description) && /* @__PURE__ */ jsx8(
                          "button",
                          {
                            type: "button",
                            className: "hsk-sp-mobile-main-card-specs-btn",
                            onClick: () => setShowSpecs(true),
                            children: "Specs"
                          }
                        )
                      ] }),
                      (() => {
                        const similarProducts = results.filter(
                          (r) => {
                            const isSameName = !!(r.product.name && displayProduct?.name && r.product.name.toLowerCase() === displayProduct.name.toLowerCase());
                            const isSameSlug = r.product.slug && displayProduct?.slug && r.product.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                            return !isSameName && !isSameSlug;
                          }
                        );
                        if (similarProducts.length === 0) return null;
                        return /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-similar-carousel-inline", children: [
                          /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-similar-carousel-title", children: "Similar Products" }),
                          /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-similar-carousel-list", children: similarProducts.map((r) => {
                            const price = parseFloat(r.product.price?.replace(/[^0-9.]/g, "") || "0");
                            const currency = r.product.currency ?? "KES";
                            return /* @__PURE__ */ jsxs7(
                              "div",
                              {
                                className: "hsk-sp-mobile-similar-carousel-item",
                                onClick: () => handleNav(r),
                                children: [
                                  /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-similar-carousel-img", children: r.product.images?.[0] ? /* @__PURE__ */ jsx8("img", { src: r.product.images[0], alt: r.product.name }) : /* @__PURE__ */ jsx8("span", { children: "\u{1F6CD}" }) }),
                                  /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-similar-carousel-meta", children: [
                                    /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-similar-carousel-name", title: r.product.name, children: r.product.name }),
                                    /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-similar-carousel-price", children: [
                                      currency,
                                      " ",
                                      price.toLocaleString()
                                    ] })
                                  ] })
                                ]
                              },
                              r.id
                            );
                          }) })
                        ] });
                      })()
                    ] })
                  ] })
                ] }) }, idx);
              }),
              chatLoading && /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-typing-row", children: [
                /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx8(SparkleIcon3, {}) }),
                /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-typing", children: [
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-dot" })
                ] })
              ] }),
              chatError && /* @__PURE__ */ jsx8("div", { className: "hsk-cb-error", children: getFriendlyError2(chatError) }),
              /* @__PURE__ */ jsx8("div", { ref: chatBottomRef, style: { height: 1 } })
            ] }),
            /* @__PURE__ */ jsx8("div", { className: "hsk-cb-input-wrap", children: /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-input-box", children: [
              /* @__PURE__ */ jsx8(
                "textarea",
                {
                  ref: chatTextareaRef,
                  className: "hsk-cb-textarea",
                  value: chatInput,
                  onChange: handleInput,
                  onKeyDown: handleKeyDown,
                  placeholder: "Ask about this product, specs, or comparison...",
                  rows: 1,
                  disabled: chatLoading
                }
              ),
              /* @__PURE__ */ jsx8(
                "button",
                {
                  className: "hsk-cb-send",
                  onClick: () => handleSend(),
                  disabled: !chatInput.trim() || chatLoading,
                  "aria-label": "Send message",
                  children: /* @__PURE__ */ jsx8(ArrowUpIcon3, {})
                }
              )
            ] }) })
          ] }),
          showSpecs && displayProduct && /* @__PURE__ */ jsx8("div", { className: "hsk-sp-mobile-specs-overlay", onClick: () => setShowSpecs(false), children: /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-specs-drawer", onClick: (e) => e.stopPropagation(), children: [
            /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-specs-header", children: [
              /* @__PURE__ */ jsx8("h3", { children: "Specifications" }),
              /* @__PURE__ */ jsx8("button", { type: "button", onClick: () => setShowSpecs(false), children: "Close" })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-specs-body", children: [
              /* @__PURE__ */ jsx8("h4", { className: "hsk-sp-mobile-specs-title", children: displayProduct.name }),
              displayProduct.description && /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-specs-desc", children: [
                /* @__PURE__ */ jsx8("h5", { children: "Description" }),
                /* @__PURE__ */ jsx8("p", { children: displayProduct.description })
              ] }),
              displayProduct.specs && Object.keys(displayProduct.specs).length > 0 && /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-specs-list", children: [
                /* @__PURE__ */ jsx8("h5", { children: "Details" }),
                Object.entries(displayProduct.specs).map(([key, val]) => /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-mobile-spec-row", children: [
                  /* @__PURE__ */ jsx8("span", { className: "hsk-sp-mobile-spec-label", children: key }),
                  /* @__PURE__ */ jsx8("span", { className: "hsk-sp-mobile-spec-value", children: val })
                ] }, key))
              ] })
            ] })
          ] }) })
        ] })
      }
    );
  }
  return /* @__PURE__ */ jsx8(
    "div",
    {
      className: cn("hsk-sp-backdrop", classNames.backdrop),
      onClick: onClose,
      style: {
        backdropFilter: `blur(${blurVal})`,
        WebkitBackdropFilter: `blur(${blurVal})`,
        background: bg ?? void 0,
        ...customStyles
      },
      children: /* @__PURE__ */ jsxs7("div", { className: cn("hsk-sp-card hsk-sp-fullscreen", classNames.card), onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-header", children: [
          /* @__PURE__ */ jsx8("span", { className: "hsk-sp-header-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx8(SparkleIcon3, {}) }),
          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-header-body", children: [
            /* @__PURE__ */ jsx8("div", { className: "hsk-sp-header-title", children: displayProduct?.name || productName }),
            /* @__PURE__ */ jsx8("div", { className: "hsk-sp-header-sub", children: "Ask questions, compare specs, or check similar products" })
          ] }),
          /* @__PURE__ */ jsx8("button", { className: "hsk-sp-close", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx8(CloseIcon2, {}) })
        ] }),
        searchLoading && /* @__PURE__ */ jsx8("div", { className: "hsk-sp-bar" }),
        /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-body", children: [
          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-details-pane", children: [
            displayProduct && /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-product-profile-container", children: [
              /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-product-profile", children: [
                /* @__PURE__ */ jsx8("div", { className: "hsk-sp-details-imgwrap", children: displayProduct.images?.[0] ? /* @__PURE__ */ jsx8("img", { src: displayProduct.images[0], alt: displayProduct.name }) : /* @__PURE__ */ jsx8("span", { className: "hsk-sp-img-placeholder", children: "\u{1F6CD}" }) }),
                /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-details-meta", children: [
                  displayProduct.brand && /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-brand", children: displayProduct.brand }),
                  displayProduct.category && /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-cat", children: displayProduct.category }),
                  /* @__PURE__ */ jsx8("h2", { className: "hsk-sp-details-name", children: displayProduct.name }),
                  /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-item-price-row", children: [
                    /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-currency", children: displayProduct.currency ?? "KES" }),
                    /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-price", children: parseFloat(displayProduct.price?.replace(/[^0-9.]/g, "") || "0").toLocaleString() }),
                    displayProduct.originalPrice && /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-original-price", children: parseFloat(displayProduct.originalPrice.replace(/[^0-9.]/g, "") || "0").toLocaleString() }),
                    displayProduct.discount && /* @__PURE__ */ jsxs7("span", { className: "hsk-sp-item-discount", children: [
                      "(",
                      displayProduct.discount,
                      ")"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-item-meta-badges", children: [
                    displayProduct.rating && /* @__PURE__ */ jsxs7("span", { className: "hsk-sp-meta-badge hsk-sp-meta-badge-rating", children: [
                      "\u2605 ",
                      parseFloat(displayProduct.rating.toString()).toFixed(1),
                      " ",
                      displayProduct.reviewCount ? `(${displayProduct.reviewCount})` : ""
                    ] }),
                    displayProduct.availability && /* @__PURE__ */ jsx8("span", { className: `hsk-sp-meta-badge hsk-sp-meta-badge-avail ${displayProduct.availability.toLowerCase().includes("in") ? "in-stock" : "out-stock"}`, children: displayProduct.availability }),
                    displayProduct.stock && !displayProduct.availability && /* @__PURE__ */ jsxs7("span", { className: "hsk-sp-meta-badge hsk-sp-meta-badge-stock", children: [
                      "Stock: ",
                      displayProduct.stock
                    ] })
                  ] })
                ] })
              ] }),
              displayProduct.specs && Object.keys(displayProduct.specs).length > 0 && /* @__PURE__ */ jsx8("div", { className: "hsk-sp-specs-horizontal", children: Object.entries(displayProduct.specs).map(([key, val]) => /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-spec-item-horizontal", children: [
                /* @__PURE__ */ jsxs7("span", { className: "hsk-sp-spec-label-horizontal", children: [
                  key,
                  ":"
                ] }),
                /* @__PURE__ */ jsx8("span", { className: "hsk-sp-spec-value-horizontal", title: val, children: val })
              ] }, key)) }),
              displayProduct.description && /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-details-desc", children: [
                /* @__PURE__ */ jsx8("h4", { children: "Description" }),
                /* @__PURE__ */ jsx8("p", { children: displayProduct.description })
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-similar-section", children: [
              /* @__PURE__ */ jsx8("h3", { children: "Similar Products" }),
              /* @__PURE__ */ jsx8("div", { className: "hsk-sp-results", children: (() => {
                const similarProducts = results.filter(
                  (r) => {
                    const isSameName = !!(r.product.name && displayProduct?.name && r.product.name.toLowerCase() === displayProduct.name.toLowerCase());
                    const isSameSlug = r.product.slug && displayProduct?.slug && r.product.slug.toLowerCase() === displayProduct.slug.toLowerCase();
                    return !isSameName && !isSameSlug;
                  }
                );
                if (!searchLoading && similarProducts.length === 0) {
                  return /* @__PURE__ */ jsx8("div", { className: "hsk-sp-empty", children: "No similar products found." });
                }
                return similarProducts.map((r, i) => {
                  const price = parseFloat(r.product.price?.replace(/[^0-9.]/g, "") || "0");
                  const currency = r.product.currency ?? "KES";
                  return /* @__PURE__ */ jsxs7(
                    "div",
                    {
                      className: cn("hsk-sp-item", classNames.item),
                      style: { animationDelay: `${i * 55}ms`, cursor: "pointer" },
                      onClick: () => handleNav(r),
                      children: [
                        /* @__PURE__ */ jsx8("div", { className: "hsk-sp-img-wrap", children: r.product.images?.[0] ? /* @__PURE__ */ jsx8("img", { src: r.product.images[0], alt: r.product.name }) : /* @__PURE__ */ jsx8("span", { className: "hsk-sp-img-placeholder", children: "\u{1F6CD}" }) }),
                        /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-item-body", children: [
                          /* @__PURE__ */ jsxs7("div", { children: [
                            r.product.category && /* @__PURE__ */ jsx8("div", { className: "hsk-sp-item-cat", children: r.product.category }),
                            /* @__PURE__ */ jsx8("div", { className: "hsk-sp-item-name", title: r.product.name, children: r.product.name })
                          ] }),
                          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-item-price-row", children: [
                            /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-currency", children: currency }),
                            /* @__PURE__ */ jsx8("span", { className: "hsk-sp-item-price", children: price.toLocaleString() })
                          ] }),
                          /* @__PURE__ */ jsx8("div", { className: "hsk-sp-actions", children: /* @__PURE__ */ jsx8(
                            "button",
                            {
                              className: "hsk-sp-action hsk-sp-action-primary",
                              onClick: (e) => {
                                e.stopPropagation();
                                handleNav(r);
                              },
                              children: "View"
                            }
                          ) })
                        ] })
                      ]
                    },
                    r.id
                  );
                });
              })() })
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "hsk-sp-chat-pane", children: [
            /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-msgs", children: [
              displayMessages.map((msg, idx) => {
                const isUser = msg.role === "user";
                return /* @__PURE__ */ jsx8("div", { className: "hsk-cb-msg-group", children: isUser ? /* @__PURE__ */ jsx8("div", { className: "hsk-cb-user-msg", children: /* @__PURE__ */ jsx8("div", { className: "hsk-cb-user-bubble", children: msg.content }) }) : /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-ai-msg", children: [
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx8(SparkleIcon3, {}) }),
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-body", children: /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-text", children: renderMarkdown(msg.content) }) })
                ] }) }, idx);
              }),
              chatLoading && /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-typing-row", children: [
                /* @__PURE__ */ jsx8("div", { className: "hsk-cb-ai-icon", style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsx8(SparkleIcon3, {}) }),
                /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-typing", children: [
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-dot" }),
                  /* @__PURE__ */ jsx8("div", { className: "hsk-cb-dot" })
                ] })
              ] }),
              chatError && /* @__PURE__ */ jsx8("div", { className: "hsk-cb-error", children: getFriendlyError2(chatError) }),
              /* @__PURE__ */ jsx8("div", { ref: chatBottomRef, style: { height: 1 } })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-input-wrap", children: [
              /* @__PURE__ */ jsxs7("div", { className: "hsk-cb-input-box", children: [
                /* @__PURE__ */ jsx8(
                  "textarea",
                  {
                    ref: chatTextareaRef,
                    className: "hsk-cb-textarea",
                    value: chatInput,
                    onChange: handleInput,
                    onKeyDown: handleKeyDown,
                    placeholder: "Ask about this product, specs, or comparison...",
                    rows: 1,
                    disabled: chatLoading
                  }
                ),
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    className: "hsk-cb-send",
                    onClick: () => handleSend(),
                    disabled: !chatInput.trim() || chatLoading,
                    "aria-label": "Send message",
                    children: /* @__PURE__ */ jsx8(ArrowUpIcon3, {})
                  }
                )
              ] }),
              /* @__PURE__ */ jsx8("div", { className: "hsk-cb-hint", children: "Akropolys \xB7 instant product knowledge" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx8("div", { className: "hsk-sp-footer", children: /* @__PURE__ */ jsx8("span", { className: "hsk-sp-esc", children: "Esc to close" }) })
      ] })
    }
  );
}
function Sparkle({
  productName,
  limit = 8,
  onResult,
  backdropColor,
  backdropBlur,
  className,
  onNavigate,
  theme,
  classNames = {},
  product,
  children
}) {
  const [open, setOpen] = useState6(false);
  const [mounted, setMounted] = useState6(false);
  useEffect4(() => {
    setMounted(true);
  }, []);
  const customStyles = {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  };
  return /* @__PURE__ */ jsxs7(Fragment4, { children: [
    /* @__PURE__ */ jsx8(
      "button",
      {
        className: cn("hsk-sp-btn", classNames.button, className),
        onClick: () => setOpen(true),
        style: customStyles,
        title: "Find similar products",
        "aria-label": "Find similar products",
        children: children || /* @__PURE__ */ jsx8(SparkleIcon3, {})
      }
    ),
    open && mounted && createPortal2(
      /* @__PURE__ */ jsx8(
        SparkleModal,
        {
          productName,
          limit,
          onResult,
          backdropColor,
          backdropBlur,
          onClose: () => setOpen(false),
          onNavigate,
          theme,
          classNames,
          product
        }
      ),
      document.body
    )
  ] });
}

// src/components/CartBadge.tsx
import { useCart } from "@akropolys/sdk";
import { jsx as jsx9 } from "react/jsx-runtime";
function CartBadge({ className }) {
  const { cart } = useCart();
  if (!cart || cart.item_count === 0) return null;
  return /* @__PURE__ */ jsx9("span", { className: cn("hsk-cart-badge", className), children: cart.item_count });
}

// src/components/CartDrawer.tsx
import { useState as useState8, useEffect as useEffect6 } from "react";
import { createPortal as createPortal4 } from "react-dom";
import { useCart as useCart3, useAkropolysContext as useAkropolysContext6 } from "@akropolys/sdk";

// src/components/CheckoutModal.tsx
import { useState as useState7, useEffect as useEffect5 } from "react";
import { createPortal as createPortal3 } from "react-dom";
import { useCart as useCart2, useAkropolysContext as useAkropolysContext5, usePaymentPolling as usePaymentPolling2 } from "@akropolys/sdk";
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function CheckoutModal({
  onClose,
  theme,
  customStyles,
  hskThemeAttr
}) {
  const { cart, loading: cartLoading } = useCart2();
  const client = useAkropolysContext5();
  const [config, setConfig] = useState7(null);
  const [loadingConfig, setLoadingConfig] = useState7(true);
  const [phone, setPhone] = useState7(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("akropolys_user_phone") || "";
    }
    return "";
  });
  const [email, setEmail] = useState7(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("akropolys_user_email") || "";
    }
    return "";
  });
  const [firstName, setFirstName] = useState7(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("akropolys_user_firstname") || "";
    }
    return "";
  });
  const [lastName, setLastName] = useState7(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("akropolys_user_lastname") || "";
    }
    return "";
  });
  const [phase, setPhase] = useState7("idle");
  const [merchantRef, setMerchantRef] = useState7(null);
  const [payError, setPayError] = useState7(null);
  const {} = usePaymentPolling2({
    client: client.api,
    merchantReference: merchantRef,
    onSuccess: () => {
      setPhase("done");
      setMerchantRef(null);
    },
    onFailure: () => {
      setPhase("failed");
      setPayError("Payment failed or timed out. Please try again.");
      setMerchantRef(null);
    }
  });
  useEffect5(() => {
    client.api.getCheckoutConfig().then((res) => setConfig(res.payment_methods)).catch(() => {
    }).finally(() => setLoadingConfig(false));
  }, [client]);
  const hasPaymentMethods = config && Object.values(config).some((m) => m.enabled);
  const handlePay = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setPayError("Phone number is required.");
      return;
    }
    setPayError(null);
    setPhase("awaiting");
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("akropolys_user_phone", phone.trim());
        localStorage.setItem("akropolys_user_email", email.trim());
        localStorage.setItem("akropolys_user_firstname", firstName.trim());
        localStorage.setItem("akropolys_user_lastname", lastName.trim());
      }
      const res = await client.api.initiatePayment(phone.trim(), email, firstName, lastName);
      if (res?.merchantReference) {
        setMerchantRef(res.merchantReference);
      } else {
        throw new Error("No merchant reference returned.");
      }
    } catch (err) {
      setPhase("failed");
      setPayError(err.message || "Could not connect to payment processor.");
    }
  };
  const currency = cart?.currency || "KES";
  const total = cart?.total || 0;
  const backdropStyle = { ...customStyles, fontSize: "15px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', zIndex: 999999 };
  return createPortal3(
    /* @__PURE__ */ jsx10(
      "div",
      {
        className: "hsk-checkout-backdrop-full",
        style: backdropStyle,
        "data-hsk-theme": hskThemeAttr,
        children: /* @__PURE__ */ jsxs8(
          "div",
          {
            className: "hsk-checkout-modal-full",
            style: customStyles,
            "data-hsk-theme": hskThemeAttr,
            children: [
              /* @__PURE__ */ jsx10(
                "button",
                {
                  onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  },
                  className: "hsk-checkout-close-x",
                  "aria-label": "Close checkout",
                  children: /* @__PURE__ */ jsxs8("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsx10("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
                    /* @__PURE__ */ jsx10("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
                  ] })
                }
              ),
              /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-panel-left", children: /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-left-content", children: [
                /* @__PURE__ */ jsxs8("button", { onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }, className: "hsk-checkout-back-btn", children: [
                  /* @__PURE__ */ jsxs8("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsx10("line", { x1: "19", y1: "12", x2: "5", y2: "12" }),
                    /* @__PURE__ */ jsx10("polyline", { points: "12 19 5 12 12 5" })
                  ] }),
                  "Back to store"
                ] }),
                /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-store-info", children: /* @__PURE__ */ jsx10("h2", { children: "Secure Checkout" }) }),
                /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-amount-due", children: [
                  /* @__PURE__ */ jsx10("span", { className: "hsk-checkout-label-muted", children: "Pay total" }),
                  /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-grand-total", children: [
                    currency,
                    " ",
                    total.toLocaleString(void 0, { minimumFractionDigits: 2 })
                  ] })
                ] }),
                cartLoading || !cart ? /* @__PURE__ */ jsx10("p", { className: "hsk-cart-loading", children: "Loading order..." }) : /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-items-list-wrap", children: /* @__PURE__ */ jsx10("ul", { className: "hsk-checkout-items-list", children: cart.items.map((item) => /* @__PURE__ */ jsxs8("li", { className: "hsk-checkout-item-row", children: [
                  /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-item-img-container", children: [
                    item.image ? /* @__PURE__ */ jsx10("img", { src: item.image, alt: item.name, className: "hsk-checkout-item-img" }) : /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-item-img-placeholder", children: "\u{1F6D2}" }),
                    /* @__PURE__ */ jsx10("span", { className: "hsk-checkout-item-qty-badge", children: item.quantity })
                  ] }),
                  /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-item-details", children: /* @__PURE__ */ jsx10("span", { className: "hsk-checkout-item-name", children: item.name }) }),
                  /* @__PURE__ */ jsxs8("span", { className: "hsk-checkout-item-price", children: [
                    item.currency,
                    " ",
                    (item.price_numeric * item.quantity).toLocaleString(void 0, { minimumFractionDigits: 2 })
                  ] })
                ] }, item.id)) }) })
              ] }) }),
              /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-panel-right", children: /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-right-content", children: phase === "done" ? /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-status-card success", children: [
                /* @__PURE__ */ jsx10("div", { className: "hsk-status-icon-wrap success", children: /* @__PURE__ */ jsxs8("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ jsx10("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }),
                  /* @__PURE__ */ jsx10("polyline", { points: "22 4 12 14.01 9 11.01" })
                ] }) }),
                /* @__PURE__ */ jsx10("h3", { children: "Payment Successful!" }),
                /* @__PURE__ */ jsx10("p", { children: "Your transaction has been confirmed. Thank you for your order!" }),
                /* @__PURE__ */ jsx10("button", { onClick: onClose, className: "hsk-pay-btn hsk-btn-primary", style: { marginTop: "1.5rem" }, children: "Continue Shopping" })
              ] }) : phase === "awaiting" ? /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-status-card awaiting", children: [
                /* @__PURE__ */ jsx10("div", { className: "hsk-status-spinner-wrap", children: /* @__PURE__ */ jsx10("div", { className: "hsk-status-spinner" }) }),
                /* @__PURE__ */ jsx10("h3", { children: "Confirm payment on your phone" }),
                /* @__PURE__ */ jsxs8("p", { children: [
                  "We've sent an M-Pesa STK push prompt to ",
                  /* @__PURE__ */ jsxs8("strong", { children: [
                    "254",
                    phone
                  ] }),
                  "."
                ] }),
                /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-stk-instructions", children: [
                  /* @__PURE__ */ jsx10("p", { children: "1. Check your phone lockscreen for the M-Pesa prompt." }),
                  /* @__PURE__ */ jsx10("p", { children: "2. Enter your M-Pesa PIN and press OK." }),
                  /* @__PURE__ */ jsx10("p", { children: "3. Wait here \u2014 this page auto-updates once confirmed." })
                ] }),
                /* @__PURE__ */ jsx10(
                  "button",
                  {
                    onClick: () => {
                      setPhase("cancelled");
                      setMerchantRef(null);
                    },
                    className: "hsk-checkout-cancel-btn",
                    children: "Cancel payment"
                  }
                )
              ] }) : phase === "cancelled" ? /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-status-card cancelled", children: [
                /* @__PURE__ */ jsx10("div", { className: "hsk-status-icon-wrap cancelled", children: /* @__PURE__ */ jsxs8("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ jsx10("path", { d: "m15 9-6 6M9 9l6 6" }),
                  /* @__PURE__ */ jsx10("circle", { cx: "12", cy: "12", r: "10" })
                ] }) }),
                /* @__PURE__ */ jsx10("h3", { children: "Payment Cancelled" }),
                /* @__PURE__ */ jsx10("p", { children: "No charge was made. You can update your phone number and try again whenever you're ready." }),
                /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-status-actions", children: [
                  /* @__PURE__ */ jsx10("button", { onClick: () => {
                    setPhase("idle");
                    setPayError(null);
                  }, className: "hsk-pay-btn hsk-btn-primary", children: "Try again" }),
                  /* @__PURE__ */ jsx10("button", { onClick: onClose, className: "hsk-checkout-cancel-btn", children: "Back to cart" })
                ] })
              ] }) : phase === "failed" ? /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-status-card failed", children: [
                /* @__PURE__ */ jsx10("div", { className: "hsk-status-icon-wrap failed", children: /* @__PURE__ */ jsxs8("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ jsx10("circle", { cx: "12", cy: "12", r: "10" }),
                  /* @__PURE__ */ jsx10("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
                  /* @__PURE__ */ jsx10("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })
                ] }) }),
                /* @__PURE__ */ jsx10("h3", { children: "Payment Failed" }),
                /* @__PURE__ */ jsx10("p", { className: "hsk-checkout-error-text", children: payError || "Could not verify M-Pesa transaction. Please check your phone and try again." }),
                /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-status-actions", children: [
                  /* @__PURE__ */ jsx10("button", { onClick: () => {
                    setPhase("idle");
                    setPayError(null);
                  }, className: "hsk-pay-btn hsk-btn-primary", children: "Try again" }),
                  /* @__PURE__ */ jsx10("button", { onClick: onClose, className: "hsk-checkout-cancel-btn", children: "Back to cart" })
                ] })
              ] }) : /* @__PURE__ */ jsxs8("div", { className: "hsk-checkout-payment-form-wrap", children: [
                /* @__PURE__ */ jsx10("h3", { className: "hsk-checkout-section-title", children: "Payment details" }),
                loadingConfig ? /* @__PURE__ */ jsx10("p", { className: "hsk-cart-loading", children: "Loading payment configuration..." }) : !hasPaymentMethods ? /* @__PURE__ */ jsx10("p", { className: "hsk-checkout-error", children: "No payment methods configured for this store." }) : /* @__PURE__ */ jsxs8("form", { onSubmit: handlePay, className: "hsk-stripe-checkout-form", children: [
                  /* @__PURE__ */ jsxs8("div", { className: "hsk-form-group", children: [
                    /* @__PURE__ */ jsx10("label", { className: "hsk-form-label", children: "M-Pesa Mobile Number" }),
                    /* @__PURE__ */ jsxs8("div", { className: "hsk-phone-input-container", children: [
                      /* @__PURE__ */ jsx10("span", { className: "hsk-phone-prefix", children: "254" }),
                      /* @__PURE__ */ jsx10(
                        "input",
                        {
                          type: "tel",
                          required: true,
                          placeholder: "712345678",
                          pattern: "[0-9]{9}",
                          maxLength: 9,
                          value: phone,
                          onChange: (e) => setPhone(e.target.value.replace(/\D/g, "")),
                          className: "hsk-phone-input-field"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsx10("span", { className: "hsk-form-hint", children: "Enter your 9-digit number (e.g. 712345678)" })
                  ] }),
                  /* @__PURE__ */ jsxs8("div", { className: "hsk-form-group", children: [
                    /* @__PURE__ */ jsx10("label", { className: "hsk-form-label", children: "Email address" }),
                    /* @__PURE__ */ jsx10(
                      "input",
                      {
                        type: "email",
                        placeholder: "john.doe@example.com",
                        value: email,
                        onChange: (e) => setEmail(e.target.value),
                        className: "hsk-form-input"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs8("div", { className: "hsk-form-row", children: [
                    /* @__PURE__ */ jsxs8("div", { className: "hsk-form-group", children: [
                      /* @__PURE__ */ jsx10("label", { className: "hsk-form-label", children: "First Name" }),
                      /* @__PURE__ */ jsx10(
                        "input",
                        {
                          type: "text",
                          placeholder: "John",
                          value: firstName,
                          onChange: (e) => setFirstName(e.target.value),
                          className: "hsk-form-input"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxs8("div", { className: "hsk-form-group", children: [
                      /* @__PURE__ */ jsx10("label", { className: "hsk-form-label", children: "Last Name" }),
                      /* @__PURE__ */ jsx10(
                        "input",
                        {
                          type: "text",
                          placeholder: "Doe",
                          value: lastName,
                          onChange: (e) => setLastName(e.target.value),
                          className: "hsk-form-input"
                        }
                      )
                    ] })
                  ] }),
                  payError && /* @__PURE__ */ jsx10("div", { className: "hsk-form-error-banner", children: payError }),
                  /* @__PURE__ */ jsxs8("button", { type: "submit", className: "hsk-checkout-submit-btn", children: [
                    "Pay ",
                    currency,
                    " ",
                    total.toLocaleString()
                  ] }),
                  /* @__PURE__ */ jsx10("div", { className: "hsk-checkout-footer-brand", children: /* @__PURE__ */ jsx10("span", { children: "Powered by Akropolys" }) })
                ] })
              ] }) }) })
            ]
          }
        )
      }
    ),
    document.body
  );
}

// src/components/CartDrawer.tsx
import { Fragment as Fragment5, jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
function CartDrawer({
  trigger,
  className,
  theme
}) {
  const { cart, loading } = useCart3();
  const [open, setOpen] = useState8(false);
  const [showCheckout, setShowCheckout] = useState8(false);
  const [mounted, setMounted] = useState8(false);
  const client = useAkropolysContext6();
  useEffect6(() => {
    setMounted(true);
    const handleTriggerCheckout = () => {
      setShowCheckout(true);
      setOpen(false);
    };
    window.addEventListener("akropolys:trigger_checkout", handleTriggerCheckout);
    return () => {
      window.removeEventListener("akropolys:trigger_checkout", handleTriggerCheckout);
    };
  }, []);
  useEffect6(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) return;
    const event = new CustomEvent("akropolys:trigger_checkout", { cancelable: true });
    window.dispatchEvent(event);
    if (event.defaultPrevented) {
      setOpen(false);
      return;
    }
    setShowCheckout(true);
  };
  const isStringTheme = typeof theme === "string";
  const hskThemeAttr = isStringTheme ? theme : void 0;
  const customStyles = !isStringTheme && theme ? {
    ...theme?.primaryColor && { "--hsk-primary": theme.primaryColor, "--hsk-primary-color": theme.primaryColor },
    ...theme?.backgroundColor && { "--hsk-bg": theme.backgroundColor },
    ...theme?.textColor && { "--hsk-text": theme.textColor },
    ...theme?.fontFamily && { "--hsk-font": theme.fontFamily },
    ...theme?.borderRadius && { "--hsk-border-radius": theme.borderRadius }
  } : void 0;
  return /* @__PURE__ */ jsxs9(Fragment5, { children: [
    trigger ? /* @__PURE__ */ jsx11("div", { onClick: () => setOpen(true), style: { display: "inline-block" }, children: trigger }) : /* @__PURE__ */ jsxs9(
      "button",
      {
        onClick: () => setOpen(true),
        className: cn("hsk-cart-trigger", className),
        style: customStyles,
        "data-hsk-theme": hskThemeAttr,
        "aria-label": "Open cart",
        children: [
          /* @__PURE__ */ jsxs9("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsx11("circle", { cx: "9", cy: "21", r: "1" }),
            /* @__PURE__ */ jsx11("circle", { cx: "20", cy: "21", r: "1" }),
            /* @__PURE__ */ jsx11("path", { d: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" })
          ] }),
          cart && cart.item_count > 0 ? /* @__PURE__ */ jsx11("span", { className: "hsk-cart-trigger-badge", children: cart.item_count }) : null
        ]
      }
    ),
    open && mounted && createPortal4(
      /* @__PURE__ */ jsx11(
        "div",
        {
          className: "hsk-cart-backdrop",
          style: customStyles,
          "data-hsk-theme": hskThemeAttr,
          onClick: () => setOpen(false),
          children: /* @__PURE__ */ jsxs9(
            "div",
            {
              className: "hsk-cart-bottom-sheet",
              style: customStyles,
              "data-hsk-theme": hskThemeAttr,
              onClick: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ jsx11("div", { className: "hsk-cart-sheet-handle" }),
                /* @__PURE__ */ jsxs9("div", { className: "hsk-cart-sheet-header", children: [
                  /* @__PURE__ */ jsx11("h2", { children: "Your Cart" }),
                  /* @__PURE__ */ jsx11("button", { onClick: () => setOpen(false), className: "hsk-close-btn", children: "\xD7" })
                ] }),
                /* @__PURE__ */ jsx11("div", { className: "hsk-cart-sheet-content", children: loading && !cart ? /* @__PURE__ */ jsx11("div", { className: "hsk-cart-loading", children: "Loading cart..." }) : !cart || cart.items.length === 0 ? /* @__PURE__ */ jsx11("div", { className: "hsk-cart-empty", children: "Your cart is empty." }) : /* @__PURE__ */ jsx11("ul", { className: "hsk-cart-items", children: cart.items.map((item) => /* @__PURE__ */ jsxs9("li", { className: "hsk-cart-item", children: [
                  item.image && /* @__PURE__ */ jsx11("img", { src: item.image, alt: item.name, className: "hsk-cart-item-img" }),
                  /* @__PURE__ */ jsxs9("div", { className: "hsk-cart-item-info", children: [
                    /* @__PURE__ */ jsx11("span", { className: "hsk-cart-item-name", children: item.name }),
                    /* @__PURE__ */ jsxs9("span", { className: "hsk-cart-item-price", children: [
                      item.currency,
                      " ",
                      item.price_numeric.toLocaleString(void 0, { minimumFractionDigits: 2 })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs9("div", { className: "hsk-cart-item-qty", children: [
                    "x",
                    item.quantity
                  ] })
                ] }, item.id)) }) }),
                cart && cart.items.length > 0 && /* @__PURE__ */ jsxs9("div", { className: "hsk-cart-sheet-footer", children: [
                  /* @__PURE__ */ jsxs9("div", { className: "hsk-cart-total", children: [
                    /* @__PURE__ */ jsx11("span", { children: "Total" }),
                    /* @__PURE__ */ jsxs9("span", { children: [
                      cart.currency,
                      " ",
                      cart.total.toLocaleString(void 0, { minimumFractionDigits: 2 })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx11("button", { onClick: handleCheckout, className: "hsk-checkout-btn", children: "Checkout securely" })
                ] })
              ]
            }
          )
        }
      ),
      document.body
    ),
    showCheckout && mounted && /* @__PURE__ */ jsx11(
      CheckoutModal,
      {
        onClose: () => {
          setShowCheckout(false);
          setOpen(false);
        },
        theme: isStringTheme ? theme : void 0,
        customStyles,
        hskThemeAttr
      }
    )
  ] });
}
export {
  CartBadge,
  CartDrawer,
  ChatWidget,
  CheckoutModal,
  ComparisonMatrix,
  KikuButton,
  ChatWidget as KikuChat,
  SearchBar,
  Sparkle,
  VisualSearch,
  VoiceButton
};
//# sourceMappingURL=index.mjs.map