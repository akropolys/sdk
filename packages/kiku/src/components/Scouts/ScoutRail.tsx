import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useScouts, useAkropolysContext, Scout } from "@akropolys/sdk";
import { cn } from "../../utils/cn";
import { chime } from "../../utils/chime";
import { useDelayedClose } from "../ChatModal/hooks/useDelayedClose";
import {
  ScoutCharacter,
  ScoutMood,
  speciesName,
  speciesNick,
  SPECIES_IDS,
} from "./ScoutCharacter";
import { AnimatedNumber } from "./AnimatedNumber";
import { ScoutPin, pinSupported } from "./ScoutPin";

export interface ScoutRailProps {
  className?: string;
  themeAttr?: string;
  onAsk?: (scout: Scout) => void;
  // Starting a new scout is a conversation, not a form.
  onNew?: (avatar: string) => void;
  compact?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MIN_MINUTES = 15;
const BASE_MAX = 480;
const EXTEND_BY = 480;
const CEILING = 2880;

function readable(m: number): string {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h} hour${h > 1 ? "s" : ""}`;
}

const RAIL_EXIT_MS = 200;

const DROP_PATH =
  "M12 3 C 17 9.5, 20 12.5, 20 15.5 A 8 8 0 0 1 4 15.5 C 4 12.5, 7 9.5, 12 3 Z";

const FluidIcon = ({ size = 13, active = false }: { size?: number; active?: boolean }) => {
  const cid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("hsk-cb-fluid", active && "is-flowing")}
    >
      <clipPath id={cid}>
        <path d={DROP_PATH} />
      </clipPath>
      <path
        d={DROP_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${cid})`}>
        <path
          className="hsk-cb-fluid-wave"
          fill="currentColor"
          d="M-24 14 q 6 -2.2 12 0 t 12 0 t 12 0 t 12 0 V 26 H -24 Z"
        />
      </g>
    </svg>
  );
};

function moodOf(scout: Scout): ScoutMood {
  switch (scout.status) {
    case "active":
      return "watching";
    case "paused":
      return "resting";
    case "triggered":
      return "struck";
    default:
      return "gone";
  }
}

function label(scout: Scout): string {
  const inst = (scout.instrument || "").trim();
  if (inst && inst.length <= 9) return inst;
  const head = inst.split(/[\s/]/)[0];
  if (head && head.length <= 9) return head;
  return speciesName(scout.id, scout.avatar);
}

export function ScoutRail({
  className,
  themeAttr,
  onAsk,
  onNew,
  open: openProp,
  onOpenChange,
  compact = false,
}: ScoutRailProps) {
  const client = useAkropolysContext();
  const { scouts, balance, setAvatar, cancelScout } = useScouts();

  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );

  const wrapRef = useRef<HTMLDivElement>(null);

  const [minutes, setMinutes] = useState(90);
  const minutesRef = useRef(90);
  const pointerDrag = useRef(false);
  const [ceiling, setCeiling] = useState(BASE_MAX);
  const [priceUSD, setPriceUSD] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [roster, setRoster] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  const gooId = `hsk-scout-goo-${useId().replace(/:/g, "")}`;

  const idle = scouts.filter((s) => s.status === "idle");
  const paidAvatars = new Set(idle.map((s) => s.avatar).filter(Boolean));
  const waiting = idle.length > 0;

  const visible = scouts.filter(
    (s) =>
      s.status !== "canceled" && s.status !== "expired" && s.status !== "idle",
  );
  const activeCount = visible.filter((s) => s.status === "active").length;
  const hasScouts = visible.length > 0;
  const sharing =
    visible.filter((s) => s.status === "active" && s.dedicatedMinutes <= 0)
      .length > 1;
  const pct = ((minutes - MIN_MINUTES) / (ceiling - MIN_MINUTES)) * 100;
  const runway = activeCount > 0 ? Math.floor(balance / activeCount) : balance;

  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const s of scouts) {
      if (s.status !== "triggered") { firedRef.current.delete(s.id); continue; }
      if (firedRef.current.has(s.id)) continue;
      firedRef.current.add(s.id);
      chime("scout", s.avatar || s.id);
    }
  }, [scouts]);

  const { closing, requestClose: close } = useDelayedClose(RAIL_EXIT_MS, () => {
    setOpen(false);
    setSwapping(null);
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const path = e.composedPath();
      if (
        wrapRef.current &&
        (path.includes(wrapRef.current) ||
          wrapRef.current.contains(e.target as Node))
      )
        return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!client || !open) return;
    let stale = false;
    const t = setTimeout(() => {
      client.scouts
        .quote(minutes)
        .then((q) => {
          if (!stale) setPriceUSD(q.priceUSD);
        })
        .catch(() => {});
    }, 90);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [client, minutes, open]);

  const rescale = (v: number) => {
    setCeiling((c) => {
      if (v >= c && c < CEILING) return Math.min(CEILING, c + EXTEND_BY);
      if (c > BASE_MAX && v <= c - EXTEND_BY)
        return Math.max(BASE_MAX, c - EXTEND_BY);
      return c;
    });
  };

  const beginDrag = () => {
    setDragging(true);
    pointerDrag.current = true;
    window.addEventListener(
      "pointerup",
      () => {
        pointerDrag.current = false;
        setDragging(false);
        rescale(minutesRef.current);
      },
      { once: true },
    );
  };

  const commitTyped = () => {
    const v = Number(draft);
    if (!Number.isNaN(v) && draft.trim() !== "") {
      const next = Math.min(CEILING, Math.max(MIN_MINUTES, Math.round(v)));
      setMinutes(next);
      minutesRef.current = next;
      setCeiling(
        Math.min(
          CEILING,
          Math.max(BASE_MAX, Math.ceil(next / EXTEND_BY) * EXTEND_BY),
        ),
      );
    }
    setTyping(false);
  };

  if (!open && !closing) {
    return (
      <div className={cn("hsk-cb-scout-rail-wrap", compact && "is-compact", className)} ref={wrapRef}>
        {pinned && (
          <ScoutPin scouts={scouts} themeAttr={themeAttr} balance={balance} sourceEl={wrapRef.current} onClose={() => setPinned(false)} />
        )}
        {compact ? (
          <div className="hsk-cb-scout-dock" role="group" aria-label="Scouts">
            {SPECIES_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "hsk-cb-scout-dock-pick",
                  !paidAvatars.has(id) && "is-unpaid",
                )}
                onClick={() => {
                  setPicked(id);
                  setRoster(true);
                  setOpen(true);
                }}
                aria-label={
                  paidAvatars.has(id)
                    ? `${id}, ready to send out`
                    : `${id}, not paid for`
                }
              >
                <ScoutCharacter
                  scoutId={id}
                  avatar={id}
                  mood={paidAvatars.has(id) ? "watching" : "resting"}
                  size={26}
                />
              </button>
            ))}
            <button
              type="button"
              className="hsk-cb-scout-dock-new"
              onClick={() => {
                setPicked(null);
                setRoster(true);
                setOpen(true);
              }}
              aria-label="Choose an avatar"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        ) : (
        <button
          type="button"
          className="hsk-cb-scout-rail-trigger"
          onClick={() => setOpen(true)}
          aria-label="Scouts"
          aria-expanded="false"
        >
          <span
            className="hsk-cb-scout-trigger-icon"
            style={{ color: activeCount > 0 ? "#10b981" : undefined }}
          >
            <FluidIcon size={13} active={activeCount > 0} />
          </span>
          <span>{activeCount > 0 ? `${activeCount} in motion` : "Scouts"}</span>
          {activeCount > 0 && <span className="hsk-cb-scout-trigger-dot" />}
        </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "hsk-cb-scout-rail-wrap",
        compact && "is-compact",
        "is-open",
        closing && "is-closing",
        className,
      )}
      ref={wrapRef}
    >
      {pinned && (
        <ScoutPin scouts={scouts} themeAttr={themeAttr} balance={balance} sourceEl={wrapRef.current} onClose={() => setPinned(false)} />
      )}
      <svg
        width="0"
        height="0"
        aria-hidden="true"
        className="hsk-cb-scout-defs"
      >
        <filter id={gooId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
          <feColorMatrix
            in="b"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
          />
        </filter>
      </svg>

      <div className="hsk-cb-scout-rail-card" role="dialog" aria-label="Scouts">
        <div className="hsk-cb-scout-card-head">
          <span className="hsk-cb-scout-card-title">
            Scouts
          </span>
          {hasScouts && pinSupported() && (
            <button
              type="button"
              className="hsk-cb-scout-card-pin"
              onClick={() => setPinned(true)}
              aria-label="Keep scouts on top"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3v6l3 4v2H6v-2l3-4V3" />
                <line x1="12" y1="15" x2="12" y2="21" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="hsk-cb-scout-card-x"
            onClick={close}
            aria-label="Close"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {hasScouts && !roster ? (
          <>
            <div className="hsk-cb-scouts-stage">
              {sharing && (
                <div
                  className="hsk-cb-scouts-glue"
                  style={{ filter: `url(#${gooId})` }}
                  aria-hidden="true"
                >
                  {visible.map((sc) => (
                    <span
                      key={sc.id}
                      className={cn(
                        "hsk-cb-glue-cell",
                        sc.dedicatedMinutes > 0 && "is-loose",
                      )}
                    >
                      <ScoutCharacter
                        scoutId={sc.id}
                        avatar={sc.avatar}
                        mood={moodOf(sc)}
                        size={38}
                        layer="body"
                      />
                    </span>
                  ))}
                </div>
              )}

              <div className="hsk-cb-scouts-row">
                {visible.map((scout) => (
                  <div key={scout.id} className="hsk-cb-scout-slot">
                    <button
                      type="button"
                      className={cn("hsk-cb-scout", `is-${scout.status}`)}
                      onClick={() => onAsk?.(scout)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSwapping(swapping === scout.id ? null : scout.id);
                      }}
                      aria-label={`${scout.instrument} ${scout.operator} ${scout.targetValue}`}
                    >
                      <span className="hsk-cb-scout-face">
                        <ScoutCharacter
                          scoutId={scout.id}
                          avatar={scout.avatar}
                          mood={moodOf(scout)}
                          size={38}
                        />
                        {scout.status === "active" && (
                          <span className="hsk-cb-scout-pulse" />
                        )}
                        {scout.dedicatedMinutes > 0 && (
                          <span className="hsk-cb-scout-own">
                            {scout.dedicatedMinutes}m
                          </span>
                        )}
                      </span>
                      <span className="hsk-cb-scout-name">{label(scout)}</span>
                    </button>

                    <button
                      type="button"
                      className="hsk-cb-scout-bin"
                      onClick={(e) => {
                        e.stopPropagation();
                        void cancelScout(scout.id);
                      }}
                      aria-label={`Call ${label(scout)} back`}
                    >
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>

                    {swapping === scout.id && (
                      <div className="hsk-cb-scout-picker">
                        {SPECIES_IDS.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className={cn(
                              "hsk-cb-scout-pick",
                              scout.avatar === id && "is-on",
                            )}
                            onClick={() => {
                              void setAvatar(scout.id, id);
                              setSwapping(null);
                            }}
                            aria-label={id}
                          >
                            <ScoutCharacter
                              scoutId={scout.id}
                              avatar={id}
                              mood="watching"
                              size={26}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="hsk-cb-scout-new"
                  onClick={() => {
                    setPicked(null);
                    setRoster(true);
                  }}
                  aria-label="Add another avatar"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="hsk-cb-scout-pool-line">
              {sharing ? (
                <>
                  <AnimatedNumber value={balance} suffix="m" /> shared · ~
                  <AnimatedNumber value={runway} suffix="m" /> each
                </>
              ) : (
                <>
                  <AnimatedNumber value={balance} suffix="m" /> left
                </>
              )}
            </div>
          </>
        ) : (
          <div className="hsk-cb-scout-hatch">
            <div className="hsk-cb-scout-hatch-row">
              {SPECIES_IDS.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "hsk-cb-scout-hatch-pick",
                    picked === id && "is-on",
                    !paidAvatars.has(id) && picked !== id && "is-unpaid",
                  )}
                  style={{ animationDelay: `${i * 34}ms` }}
                  onClick={() => setPicked(picked === id ? null : id)}
                  aria-label={
                    paidAvatars.has(id)
                      ? `${id}, ready to send out`
                      : `${id}, not paid for`
                  }
                  aria-pressed={picked === id}
                >
                  <ScoutCharacter
                    scoutId={id}
                    avatar={id}
                    mood={
                      paidAvatars.has(id) || picked === id
                        ? "watching"
                        : "resting"
                    }
                    size={30}
                  />
                  <span className="hsk-cb-scout-nick">
                    {speciesNick(id, id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hsk-cb-scout-time">
          <div className={cn("hsk-cb-dial", dragging && "is-dragging")}>
            <div className="hsk-cb-dial-track">
              <div
                className="hsk-cb-dial-fill"
                style={{ inlineSize: `${pct}%` }}
              />
            </div>
            <input
              className="hsk-cb-dial-input"
              type="range"
              min={MIN_MINUTES}
              max={ceiling}
              step={5}
              value={minutes}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMinutes(v);
                minutesRef.current = v;
                if (!pointerDrag.current) rescale(v);
              }}
              aria-label="Minutes to buy"
              aria-valuetext={readable(minutes)}
              onPointerDown={beginDrag}
              onFocus={() => setDragging(true)}
              onBlur={() => setDragging(false)}
            />
          </div>

          <div className={cn("hsk-cb-scout-time-row", dragging && "is-lifted")}>
            {typing ? (
              <input
                className="hsk-cb-scout-mins-input"
                type="number"
                min={MIN_MINUTES}
                max={CEILING}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitTyped}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTyped();
                  if (e.key === "Escape") setTyping(false);
                }}
                aria-label="Minutes"
              />
            ) : (
              <button
                type="button"
                className="hsk-cb-scout-mins"
                onClick={() => {
                  setDraft(String(minutes));
                  setTyping(true);
                }}
                aria-label={`${readable(minutes)}, tap to type an exact number`}
              >
                <AnimatedNumber value={minutes} />
                <span className="hsk-cb-scout-mins-unit">min</span>
              </button>
            )}
            <span className="hsk-cb-scout-price">
              <AnimatedNumber value={priceUSD} decimals={2} prefix="$" />
            </span>
          </div>
        </div>

        <button
          type="button"
          className="hsk-cb-scout-buy-go"
          disabled={waiting ? false : !picked}
          onClick={() => {
            if (!waiting) return;
            setRoster(false);
            setPicked(null);
            close();
            onNew?.(picked ?? "");
          }}
        >
          {waiting ? "Send it out" : picked ? "Buy time" : "Pick an avatar"}
        </button>
      </div>
    </div>
  );
}
