import React from 'react';
import { SearchResult, AkropolysTheme, ChatSource, Product, VisualSearchResponse } from '@akropolys/sdk';

interface SearchBarProps {
    placeholder?: string;
    limit?: number;
    /** Debounce in ms — default 300 for smooth type-ahead */
    debounceMs?: number;
    onSelect?: (result: SearchResult) => void;
    className?: string;
    inputClassName?: string;
    dropdownClassName?: string;
    renderResult?: (result: SearchResult) => React.ReactNode;
    theme?: AkropolysTheme;
    classNames?: {
        root?: string;
        input?: string;
        dropdown?: string;
        row?: string;
    };
}
declare function SearchBar({ placeholder, limit, debounceMs, onSelect, className, inputClassName, dropdownClassName, renderResult, theme, classNames, }: SearchBarProps): React.JSX.Element;

interface ChatWidgetProps {
    title?: string;
    placeholder?: string;
    emptyStateText?: string;
    emptyStateSuggestions?: string;
    defaultCurrency?: string;
    className?: string;
    theme?: AkropolysTheme;
    classNames?: {
        root?: string;
        header?: string;
        messageBubble?: string;
        input?: string;
    };
    onSelectSource?: (source: ChatSource) => void;
    /** Enable 🎙️ voice input via browser Web Speech API (free) */
    enableVoice?: boolean;
    /** Enable 📷 visual style-match search via Gemini (requires backend GEMINI_API_KEY) */
    enableVision?: boolean;
    /** Optional category hint for visual search (e.g. 'dress', 'curtains') */
    visionCategoryHint?: string;
}
declare function ChatWidget({ title, placeholder, emptyStateText, emptyStateSuggestions, defaultCurrency, className, theme, classNames, onSelectSource, enableVoice, enableVision, visionCategoryHint }: ChatWidgetProps): React.JSX.Element;

interface KikuButtonProps {
    label?: string;
    title?: string;
    placeholder?: string;
    backdropColor?: string;
    backdropBlur?: string | number;
    className?: string;
    onSelectSource?: (source: ChatSource) => void;
    defaultCurrency?: string;
    chips?: string[];
    theme?: 'light' | 'dark' | AkropolysTheme;
    classNames?: {
        button?: string;
        overlay?: string;
        panel?: string;
        input?: string;
        sendButton?: string;
    };
    /** Enable 🎙️ voice input via browser Web Speech API (free) */
    enableVoice?: boolean;
    /** Enable 📷 visual style-match search via Gemini (requires backend GEMINI_API_KEY) */
    enableVision?: boolean;
    /** Optional category hint for visual search (e.g. 'dress', 'curtains') */
    visionCategoryHint?: string;
}
declare function KikuButton({ label, title, placeholder, backdropColor, backdropBlur, className, onSelectSource, defaultCurrency, chips, theme, classNames, enableVoice, enableVision, visionCategoryHint, }: KikuButtonProps): React.JSX.Element;

interface SparkleProps {
    productName: string;
    limit?: number;
    onResult?: (results: SearchResult[]) => void;
    /** Override the backdrop colour (any CSS colour/gradient) */
    backdropColor?: string;
    /** Override backdrop blur — e.g. "8px" or 8 */
    backdropBlur?: string | number;
    /** Extra classes on the trigger button */
    className?: string;
    /** Called when user clicks a result — return false to prevent default navigation */
    onNavigate?: (result: SearchResult) => boolean | void;
    theme?: AkropolysTheme;
    classNames?: {
        button?: string;
        backdrop?: string;
        card?: string;
        item?: string;
    };
    product?: Product;
    children?: React.ReactNode;
}
declare function Sparkle({ productName, limit, onResult, backdropColor, backdropBlur, className, onNavigate, theme, classNames, product, children, }: SparkleProps): React.JSX.Element;

declare function CartBadge({ className }: {
    className?: string;
}): React.JSX.Element | null;

declare function CartDrawer({ trigger, className, theme }: {
    trigger?: React.ReactNode;
    className?: string;
    theme?: 'light' | 'dark' | AkropolysTheme;
}): React.JSX.Element;

declare function CheckoutModal({ onClose, theme, customStyles, hskThemeAttr }: {
    onClose: () => void;
    theme?: string;
    customStyles?: React.CSSProperties;
    hskThemeAttr?: string;
}): React.ReactPortal;

interface ComparisonMatrixProps {
    sources: ChatSource[];
    defaultCurrency?: string;
    displayConfig?: Record<string, string>;
}
declare function ComparisonMatrix({ sources, defaultCurrency, displayConfig }: ComparisonMatrixProps): React.JSX.Element | null;

interface VoiceButtonProps {
    onTranscript: (text: string) => void;
    onInterim?: (text: string) => void;
    /** BCP-47 language tag. Defaults to 'en-US'. */
    lang?: string;
    className?: string;
    disabled?: boolean;
}
/**
 * VoiceButton — converts speech to text using the browser's free Web Speech API.
 * No API key, no backend call, no cost.
 *
 * @example
 * <VoiceButton onTranscript={(text) => setQuery(text)} />
 */
declare function VoiceButton({ onTranscript, onInterim, lang, className, disabled, }: VoiceButtonProps): React.JSX.Element | null;

interface VisualSearchProps {
    /** Called with search results + the base64 preview when Gemini responds. */
    onResults: (res: VisualSearchResponse, previewBase64: string) => void;
    onError?: (err: Error) => void;
    /**
     * Category hint sent to Gemini to sharpen the match_query.
     * e.g. "dress", "curtains", "sofa", "shoes"
     */
    categoryHint?: string;
    className?: string;
    disabled?: boolean;
}
/**
 * VisualSearch — camera/image-upload button that powers style-match search.
 *
 * User picks a photo → it's base64-encoded in-browser → sent to POST /search/visual
 * → Gemini Flash extracts Style DNA → results returned via onResults().
 *
 * @example
 * <VisualSearch
 *   categoryHint="dress"
 *   onResults={(res, preview) => setVisualResults(res)}
 * />
 */
declare function VisualSearch({ onResults, onError, categoryHint, className, disabled, }: VisualSearchProps): React.JSX.Element;

export { CartBadge, CartDrawer, ChatWidget, type ChatWidgetProps, CheckoutModal, ComparisonMatrix, KikuButton, type KikuButtonProps, ChatWidget as KikuChat, type ChatWidgetProps as KikuChatProps, SearchBar, type SearchBarProps, Sparkle, VisualSearch, type VisualSearchProps, VoiceButton, type VoiceButtonProps };
