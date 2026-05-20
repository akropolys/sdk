import React, { useState, useEffect, useRef } from 'react';
import { useSearch } from '../hooks/useSearch';
import { SearchResult } from '../types';

interface SearchBarProps {
  placeholder?: string;
  limit?: number;
  debounceMs?: number;
  onSelect?: (result: SearchResult) => void;
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  renderResult?: (result: SearchResult) => React.ReactNode;
}

const S = `
  .hsk-wrap{position:relative;width:100%;font-family:inherit}
  .hsk-input{width:100%;padding:10px 16px;font-size:15px;border:1.5px solid #e2e2e2;border-radius:8px;outline:none;box-sizing:border-box;background:#fff;transition:border-color .2s}
  .hsk-input:focus{border-color:#f47c3c}
  .hsk-drop{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #e2e2e2;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:9999;max-height:360px;overflow-y:auto}
  .hsk-item{display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;transition:background .15s}
  .hsk-item:hover{background:#faf5f1}
  .hsk-item img{width:40px;height:40px;object-fit:cover;border-radius:4px}
  .hsk-item-name{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hsk-item-price{font-size:13px;color:#f47c3c;margin-top:2px}
  .hsk-msg{padding:16px;text-align:center;font-size:14px;color:#888}
`;

export function SearchBar({
  placeholder = 'Search for what you want — how you want',
  limit = 10,
  debounceMs = 300,
  onSelect,
  className,
  inputClassName,
  dropdownClassName,
  renderResult,
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { results, loading, search, clear } = useSearch();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!query.trim()) { clear(); setOpen(false); return; }
    timer.current = setTimeout(() => { search(query, limit); setOpen(true); }, debounceMs);
    return () => clearTimeout(timer.current);
  }, [query, search, clear, limit, debounceMs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery(r.product.name);
    onSelect?.(r);
  };

  return (
    <>
      <style>{S}</style>
      <div className={`hsk-wrap ${className ?? ''}`} ref={wrap}>
        <input
          className={`hsk-input ${inputClassName ?? ''}`}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
        />
        {open && (
          <div className={`hsk-drop ${dropdownClassName ?? ''}`}>
            {loading && <div className="hsk-msg">Searching…</div>}
            {!loading && results.length === 0 && <div className="hsk-msg">No results for "{query}"</div>}
            {results.map(r =>
              renderResult ? (
                <div key={r.id} onClick={() => handleSelect(r)}>{renderResult(r)}</div>
              ) : (
                <div key={r.id} className="hsk-item" onClick={() => handleSelect(r)}>
                  {r.product.images?.[0] && <img src={r.product.images[0]} alt={r.product.name} />}
                  <div>
                    <div className="hsk-item-name">{r.product.name}</div>
                    <div className="hsk-item-price">{r.product.currency ?? 'KES'} {r.product.price}</div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}
