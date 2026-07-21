import React, { useState, useEffect, useRef } from 'react';
import { useSearch, SearchResult, AkropolysTheme, useAkropolysContext } from '@akropolys/sdk';
import { cn } from '../utils/cn';

export interface SearchBarProps {
  placeholder?: string;
  limit?: number;
  /** Debounce in ms — default 150 for instant type-ahead */
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
  debounceMs = 150,
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
  const { results, loading, search, clear } = useSearch({ debounceMs });
  const client = useAkropolysContext();
  const wrap = useRef<HTMLDivElement>(null);
  const ignoreNextQueryChange = useRef(false);

  /* useSearch debounces internally — fire on every keystroke, keep stale results visible */
  useEffect(() => {
    if (ignoreNextQueryChange.current) {
      ignoreNextQueryChange.current = false;
      return;
    }
    if (!query.trim()) {
      clear();
      setOpen(false);
      return;
    }
    setOpen(true);   // open immediately (stale results show while fetching)
    search(query, limit);
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
      // keepalive: onSelect commonly navigates the page right after this call —
      // without it the browser aborts the in-flight log request mid-navigation.
      client.api.searchVector(query, 1, undefined, true).catch(() => {});
    }
    ignoreNextQueryChange.current = true;
    setOpen(false);
    setQuery(r.entity.title ?? r.entity.name ?? '');
    onSelect?.(r);
  };

  const handleCommitSearch = () => {
    if (!query.trim()) return;
    client.api.searchVector(query, 1, undefined, true).catch(() => {});
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
          {loading && <div className="hsk-sb-loading-bar" />}

          {loading && results.length === 0 ? (
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
              {results.length === 0 && !loading && (
                <div className="hsk-sb-empty">No results for &ldquo;{query}&rdquo;</div>
              )}

              {results.map((r, i) => {
                if (renderResult) {
                  return (
                    <div
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className="hsk-sb-fade"
                      style={{ animationDelay: `${i * 18}ms` }}
                    >
                      {renderResult(r)}
                    </div>
                  );
                }
                const thumb = r.entity.image ?? r.entity.thumbnail ?? r.entity.images?.[0];
                return (
                  <div
                    key={r.id}
                    className={cn("hsk-sb-row hsk-sb-fade", classNames.row)}
                    style={{ animationDelay: `${i * 18}ms` }}
                    onClick={() => handleSelect(r)}
                  >
                    <span className="hsk-sb-row-thumb">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <SearchIcon />
                      )}
                    </span>
                    <div className="hsk-sb-row-body">
                      <div className="hsk-sb-row-title">{r.entity.title ?? r.entity.name}</div>
                      {(r.entity.category || r.entity.brand) && (
                        <div className="hsk-sb-row-sub">
                          {r.entity.category ?? r.entity.brand}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

