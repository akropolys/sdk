import React, { useState, useEffect, useRef } from 'react';
import { useSearch, SearchResult, AkropolysTheme, useAkropolysContext } from '@akropolys/sdk';
import { cn } from '../utils/cn';

export interface SearchBarProps {
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

/* SVG search glass — pure inline so no icon dependency */
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="8.5" cy="8.5" r="5.5"/>
    <line x1="13" y1="13" x2="18" y2="18"/>
  </svg>
);

export function SearchBar({
  placeholder = 'Search products…',
  limit = 10,
  debounceMs = 300,
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  renderResult,
  theme,
  classNames = {},
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const { results, loading, search, clear } = useSearch();
  const client = useAkropolysContext();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const wrap = useRef<HTMLDivElement>(null);
  const ignoreNextQueryChange = useRef(false);

  /* Debounce search — but keep stale results visible between calls */
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
    setOpen(true);   // open immediately (stale results show while fetching)
    setIsDebouncing(true);
    timer.current = setTimeout(() => {
      setIsDebouncing(false);
      search(query, limit);
    }, debounceMs);
    return () => clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /* Click-outside to close */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleSelect = (r: SearchResult) => {
    if (query.trim()) {
      client.api.searchVector(query, 1).catch(() => {});
    }
    ignoreNextQueryChange.current = true;
    setOpen(false);
    setQuery(r.product.name);
    onSelect?.(r);
  };

  const handleCommitSearch = () => {
    if (!query.trim()) return;
    client.api.searchVector(query, 1).catch(() => {});
    if (results.length > 0) {
      handleSelect(results[0]);
    }
  };

  const showDrop = open && query.trim().length > 0;

  const customStyles = {
    ...(theme?.primaryColor && { '--hsk-primary': theme.primaryColor }),
    ...(theme?.backgroundColor && { '--hsk-bg': theme.backgroundColor }),
    ...(theme?.textColor && { '--hsk-text': theme.textColor }),
    ...(theme?.fontFamily && { '--hsk-font': theme.fontFamily }),
    ...(theme?.borderRadius && { '--hsk-border-radius': theme.borderRadius }),
  } as React.CSSProperties;

  return (
    <div className={cn("hsk-sb-wrap", classNames.root, className)} ref={wrap} style={customStyles}>
      <span className="hsk-sb-icon"><SearchIcon /></span>
      <input
        className={cn("hsk-sb-input", classNames.input, inputClassName)}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && query.trim() && setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            handleCommitSearch();
          }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {showDrop && (
        <div className={cn("hsk-sb-drop", classNames.dropdown, dropdownClassName)} style={{ position: 'absolute' }}>
          {(loading || isDebouncing) && <div className="hsk-sb-loading-bar" />}

          {(loading || isDebouncing) && results.length === 0 ? (
            <>
              <div className="hsk-sb-skeleton-row">
                <span className="hsk-sb-skeleton-icon" />
                <div className="hsk-sb-row-body">
                  <div className="hsk-sb-skeleton-text1" />
                  <div className="hsk-sb-skeleton-text2" />
                </div>
              </div>
              <div className="hsk-sb-skeleton-row">
                <span className="hsk-sb-skeleton-icon" />
                <div className="hsk-sb-row-body">
                  <div className="hsk-sb-skeleton-text1" style={{ width: '45%' }} />
                  <div className="hsk-sb-skeleton-text2" style={{ width: '25%' }} />
                </div>
              </div>
            </>
          ) : (
            <>
              {results.length === 0 && !loading && !isDebouncing && (
                <div className="hsk-sb-empty">No results for &ldquo;{query}&rdquo;</div>
              )}

              {results.map((r, i) => (
                renderResult ? (
                  <div
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className="hsk-sb-fade"
                    style={{ animationDelay: `${i * 18}ms` }}
                  >
                    {renderResult(r)}
                  </div>
                ) : (
                  <div
                    key={r.id}
                    className={cn("hsk-sb-row hsk-sb-fade", classNames.row)}
                    style={{ animationDelay: `${i * 18}ms` }}
                    onClick={() => handleSelect(r)}
                  >
                    <span className="hsk-sb-row-icon"><SearchIcon /></span>
                    <div className="hsk-sb-row-body">
                      <div className="hsk-sb-row-title">{r.product.name}</div>
                      {(r.product.category || r.product.brand) && (
                        <div className="hsk-sb-row-sub">
                          {r.product.category ?? r.product.brand}
                        </div>
                      )}
                    </div>
                  </div>
                )
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

