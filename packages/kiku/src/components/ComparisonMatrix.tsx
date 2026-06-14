import React from 'react';
import type { ChatSource } from '@akropolys/sdk';

interface ComparisonMatrixProps {
  sources: ChatSource[];
  defaultCurrency?: string;
}

// ── Spec parsers ──────────────────────────────────────────────────────────────

function extractSize(p: ChatSource): string | null {
  const name = p.name;
  const cat = (p.category || '').toLowerCase();
  
  // 1. If there's an explicit unit like " or inch(es)
  const mExplicit = name.match(/(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|["'″])/i);
  if (mExplicit) {
    return `${mExplicit[1]} inches`;
  }
  
  // 2. If it is a TV and contains a 2-digit size (like 43 in Hisense 43A4K)
  if (cat.includes('tv') || cat.includes('audio')) {
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
function extractResolution(name: string): string | null {
  if (/\b4K\b/i.test(name)) return '4K Ultra HD (2160p)';
  if (/\bUHD\b/i.test(name)) return 'Ultra HD (2160p)';
  if (/\b(?:Full HD|FHD|1080p)\b/i.test(name)) return 'Full HD (1080p)';
  if (/\b(?:HD|720p)\b/i.test(name)) return 'HD (720p)';
  return null;
}
function extractStorage(name: string): string | null {
  const m = name.match(/(\d+)\s*GB(?!\s*RAM)/i);
  return m ? `${m[1]} GB` : null;
}
function extractRAM(name: string): string | null {
  const m = name.match(/(\d+)\s*GB\s*RAM/i);
  return m ? `${m[1]} GB` : null;
}
function extractCamera(name: string): string | null {
  const m = name.match(/(\d+)\s*MP/i);
  return m ? `${m[1]} MP` : null;
}
function extractBattery(name: string): string | null {
  const m = name.match(/(\d{3,5})\s*mAh/i);
  return m ? `${m[1]} mAh` : null;
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface Row {
  label: string;
  values: (string | null)[];
  type?: 'image' | 'price' | 'availability' | 'text';
  bestIdx?: number;
}

function buildRows(products: ChatSource[], currency: string): Row[] {
  const rows: Row[] = [];

  // Image preview
  rows.push({
    label: 'Product Preview',
    values: products.map(s => s.image || null),
    type: 'image',
  });

  // Price (lowest = best)
  const prices = products.map(s => {
    const n = parseFloat(String(s.price ?? '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? null : n;
  });
  const priceLabels = products.map((s, i) => {
    const c = s.currency || currency;
    const n = prices[i];
    return n !== null
      ? `${c} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;
  });
  const validPrices = prices.filter((p): p is number => p !== null);
  const minPrice = validPrices.length ? Math.min(...validPrices) : null;
  rows.push({
    label: 'Price',
    values: priceLabels,
    type: 'price',
    bestIdx: minPrice !== null ? prices.indexOf(minPrice) : undefined,
  });

  // Brand
  const brands = products.map(s => s.brand || null);
  if (brands.some(Boolean)) rows.push({ label: 'Brand', values: brands });

  // Spec rows — only include if at least one product has a value
  const specDefs: { label: string; fn: (p: ChatSource) => string | null; higherIsBetter?: boolean }[] = [
    { label: 'Display Size', fn: extractSize },
    { label: 'Resolution', fn: p => extractResolution(p.name), higherIsBetter: true },
    { label: 'Storage', fn: p => extractStorage(p.name), higherIsBetter: true },
    { label: 'RAM', fn: p => extractRAM(p.name), higherIsBetter: true },
    { label: 'Camera', fn: p => extractCamera(p.name), higherIsBetter: true },
    { label: 'Battery', fn: p => extractBattery(p.name), higherIsBetter: true },
  ];

  const resOrder = ['4K Ultra HD (2160p)', 'Ultra HD (2160p)', 'Full HD (1080p)', 'HD (720p)'];

  for (const { label, fn, higherIsBetter } of specDefs) {
    const vals = products.map(s => fn(s));
    if (!vals.some(Boolean)) continue;

    let bestIdx: number | undefined;
    if (higherIsBetter && vals.filter(Boolean).length > 1) {
      if (label === 'Resolution') {
        bestIdx = vals.reduce((best, v, i) => {
          const rank = resOrder.indexOf(v ?? '');
          const bestRank = resOrder.indexOf(vals[best] ?? '');
          return rank !== -1 && (bestRank === -1 || rank < bestRank) ? i : best;
        }, 0);
      } else {
        // Numeric comparison — higher wins
        const nums = vals.map(v => parseFloat((v ?? '').replace(/[^0-9.]/g, '')));
        const max = Math.max(...nums.filter(n => !isNaN(n)));
        bestIdx = nums.indexOf(max);
      }
    }
    rows.push({ label, values: vals, bestIdx });
  }

  // Availability
  const avail = products.map(s => {
    const a = s.availability ?? '';
    if (!a) return null;
    if (/in.?stock/i.test(a)) return 'In-Stock';
    if (/out.?of.?stock/i.test(a)) return 'Out of Stock';
    return a;
  });
  if (avail.some(Boolean)) {
    rows.push({ label: 'Availability', values: avail, type: 'availability' });
  }

  // Category
  const cats = products.map(s => s.category || null);
  if (cats.some(Boolean)) rows.push({ label: 'Category', values: cats });

  return rows;
}

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function ImageCell({ value, name }: { value: string | null; name: string }) {
  if (!value) {
    return <div style={{ fontSize: 28, textAlign: 'center' }}>📦</div>;
  }
  return (
    <img
      src={value}
      alt={name}
      style={{
        width: 72,
        height: 72,
        objectFit: 'contain',
        borderRadius: 8,
        background: '#f5f5f5',
        display: 'block',
      }}
    />
  );
}

function AvailabilityCell({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: '#9ca3af' }}>—</span>;
  const inStock = /in.?stock/i.test(value);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--hsk-text, #111827)' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: inStock ? '#22c55e' : '#ef4444',
        boxShadow: inStock ? '0 0 0 3px rgba(34,197,94,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)',
        display: 'inline-block',
      }} />
      {value}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ComparisonMatrix({ sources, defaultCurrency = 'KES' }: ComparisonMatrixProps) {
  if (sources.length < 2) return null;

  const products = sources.slice(0, 3);
  const rows = buildRows(products, defaultCurrency);

  const colTemplate = `140px repeat(${products.length}, 1fr)`;

  const labelStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 700,
    // Solid dark fallback — never inherit a muted ancestor color
    color: 'var(--hsk-text-muted, #4b5563)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--hsk-border, rgba(0,0,0,0.07))',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
  };

  const cellBase: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: 13,
    // Explicit color so cells are always readable regardless of parent theme
    color: 'var(--hsk-text, #111827)',
    borderBottom: '1px solid var(--hsk-border, rgba(0,0,0,0.07))',
    verticalAlign: 'middle',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div
      className="hsk-compare-matrix"
      style={{
        marginTop: 10,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--hsk-border, rgba(0,0,0,0.09))',
        background: 'var(--hsk-surface, #fff)',
        fontSize: 13,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: colTemplate, background: 'var(--hsk-surface2, #f9fafb)', borderBottom: '2px solid var(--hsk-border, rgba(0,0,0,0.09))' }}>
        <div style={{ ...labelStyle, borderBottom: 'none', color: 'var(--hsk-text, #111)', fontSize: 12 }}>Feature</div>
        {products.map((p, i) => (
          <a
            key={i}
            href={p.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--hsk-primary, #16a34a)',
              textDecoration: 'none',
              lineHeight: 1.3,
              borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none',
            }}
          >
            {p.name}
          </a>
        ))}
      </div>

      {/* ── Data rows ── */}
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            background: rowIdx % 2 === 1 ? 'var(--hsk-surface2, rgba(0,0,0,0.015))' : 'transparent',
          }}
        >
          {/* Label */}
          <div style={labelStyle}>{row.label}</div>

          {/* Values */}
          {products.map((p, i) => {
            const val = row.values[i];
            const isBest = row.bestIdx === i && row.values.filter(Boolean).length > 1;

            if (row.type === 'image') {
              return (
                <div key={i} style={{ ...cellBase, justifyContent: 'center', padding: '12px', borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none' }}>
                  <ImageCell value={val} name={p.name} />
                </div>
              );
            }
            if (row.type === 'availability') {
              return (
                <div key={i} style={{ ...cellBase, borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none' }}>
                  <AvailabilityCell value={val} />
                </div>
              );
            }
            return (
              <div
                key={i}
                style={{
                  ...cellBase,
                  fontWeight: isBest ? 700 : 400,
                  // Always use a solid dark fallback — never 'inherit' which can be muted/invisible
                  color: isBest
                    ? 'var(--hsk-primary, #ea580c)'
                    : row.type === 'price'
                      ? 'var(--hsk-text, #374151)'   // non-cheapest price: visible but not highlighted
                      : 'var(--hsk-text, #111827)',
                  borderLeft: i > 0 ? '1px solid var(--hsk-border, rgba(0,0,0,0.07))' : 'none',
                }}
              >
                {val ?? <span style={{ color: '#9ca3af' }}>—</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
