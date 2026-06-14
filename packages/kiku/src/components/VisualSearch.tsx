import React, { useRef, useState } from 'react';
import { useAkropolysContext } from '@akropolys/sdk';
import type { VisualSearchResponse } from '@akropolys/sdk';

export interface VisualSearchProps {
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

const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="kiku-vs-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
export function VisualSearch({
  onResults,
  onError,
  categoryHint,
  className = '',
  disabled = false,
}: VisualSearchProps) {
  const client = useAkropolysContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await (client.api as any).searchByImage(base64, categoryHint);
      onResults(res as VisualSearchResponse, base64);
    } catch (e: any) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
      // Reset so the same file can be picked again
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <label
      className={`kiku-vs-btn${loading ? ' kiku-vs-btn--loading' : ''} ${className}`}
      title="Search by photo"
      aria-label="Search by uploading a photo"
      style={{ cursor: disabled || loading ? 'not-allowed' : 'pointer' }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        disabled={disabled || loading}
        hidden
      />
      {loading ? <SpinnerIcon /> : <CameraIcon />}
    </label>
  );
}
