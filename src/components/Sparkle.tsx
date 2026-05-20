import React, { useState } from 'react';
import { useHuskelContext } from './HuskelProvider';
import { SearchResult } from '../types';

interface SparkleProps {
  productName: string;
  limit?: number;
  onResult?: (results: SearchResult[]) => void;
  className?: string;
}

const S = `
  .hsk-sparkle{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;font-size:12px;font-weight:600;background:#f47c3c;color:#fff;border:none;border-radius:20px;cursor:pointer;transition:opacity .2s,transform .15s}
  .hsk-sparkle:hover{opacity:.88;transform:scale(1.04)}
  .hsk-sparkle:disabled{opacity:.5;cursor:not-allowed}
`;

export function Sparkle({ productName, limit = 5, onResult, className }: SparkleProps) {
  const client = useHuskelContext();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await client.api.search(productName, limit);
      onResult?.(res.results);
    } catch (e) {
      console.error('[Huskel Sparkle]', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{S}</style>
      <button className={`hsk-sparkle ${className ?? ''}`} onClick={handleClick} disabled={loading}>
        ✦ {loading ? 'Finding…' : 'Similar'}
      </button>
    </>
  );
}
