import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useScouts, useAkropolysContext, Scout } from "@akropolys/sdk";
import { cn } from "../../utils/cn";
import { chime } from "../../utils/chime";
import { useDelayedClose } from "../ChatModal/hooks/useDelayedClose";
import { ScoutCharacter, ScoutMood, speciesName, speciesNick, humanMinutes, SPECIES_IDS, speciesFor } from "./ScoutCharacter";
import { AnimatedNumber } from "./AnimatedNumber";
import { useT } from "../ChatModal/types";
import { ScoutPin, pinSupported } from "./ScoutPin";

export interface ScoutRailProps {
  className?: string;
  themeAttr?: string;
  onAsk?: (scout: Scout) => void;
  // Starting a new scout is a conversation, not a form.
  onNew?: (avatar: string) => void;
  compact?: boolean;
  // Mounted ahead of use but not on screen: the characters stop animating.
  paused?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MIN_MINUTES = 50;
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
  const subject = (scout.subject || "").trim();
  if (subject && subject.length <= 9) return subject;
  const head = subject.split(/[\s/]/)[0];
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
  paused = false,
}: ScoutRailProps) {
  const client = useAkropolysContext();
  const tr = useT();
  const { scouts, balance, setAvatar, cancelScout, refetch } = useScouts();

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
  const [floorMinutes, setFloorMinutes] = useState(MIN_MINUTES);
  const [picked, setPicked] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [buying, setBuying] = useState(false);

  // Checkout is a navigation away. Coming back lands on the bfcache copy of
  // this page, state and all, so the button has to be told the trip is over.
  useEffect(() => {
    const done = () => setBuying(false);
    window.addEventListener('pageshow', done);
    document.addEventListener('visibilitychange', done);
    return () => {
      window.removeEventListener('pageshow', done);
      document.removeEventListener('visibilitychange', done);
    };
  }, []);
  const [buyErr, setBuyErr] = useState<string | null>(null);

  const gooId = `hsk-scout-goo-${useId().replace(/:/g, "")}`;

  // An idle avatar minted by the webhook never starts useScouts' own polling.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("scout_paid")) return;
    url.searchParams.delete("scout_paid");
    window.history.replaceState({}, "", url.toString());
    let tries = 0;
    const timer = setInterval(() => {
      refetch().catch(() => {});
      if (++tries >= 6) clearInterval(timer);
    }, 2000);
    refetch().catch(() => {});
    return () => clearInterval(timer);
  }, [refetch]);

  const idle = scouts.filter((s) => s.status === "idle");
  const paidAvatars = new Set(idle.map((s) => s.avatar).filter(Boolean));
  // Species someone already owns lead; the rest stay behind the plus.
  const owned = SPECIES_IDS.filter((id) => paidAvatars.has(id));
  // Minutes, not idleness, decide whether an avatar is live on the shelf.
  const minutesOf = (sc: Scout | null) =>
    !sc ? 0 : sc.dedicatedMinutes > 0 ? sc.dedicatedMinutes : sc.status === "expired" ? 0 : balance;
  const isLive = (avatar: string) => minutesOf(scoutFor(avatar)) > 0;
  const moodFor = (avatar: string): "watching" | "struck" | "resting" =>
    !isLive(avatar)
      ? "resting"
      : scoutFor(avatar)?.status === "triggered"
        ? "struck"
        : "watching";
  // Owned avatars lead; the rest follow once the plus opens the shelf.
  // The button names whoever is about to go out, so the click is unambiguous.
  const sending = picked ?? (owned.length === 1 ? owned[0] : null);

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
  const pct = ((minutes - floorMinutes) / (ceiling - floorMinutes)) * 100;
  const runway = activeCount > 0 ? Math.floor(balance / activeCount) : balance;

  // One scout per avatar, the one worth reporting on: a live watcher beats a
  // finished one, which beats an avatar merely waiting for a brief.
  const rank = (st: string) =>
    st === "active" ? 0 : st === "triggered" ? 1 : st === "paused" ? 2 : st === "idle" ? 3 : 4;
  const scoutFor = (avatar: string) =>
    scouts
      .filter((sc) => speciesFor(sc.id, sc.avatar).id === avatar && sc.status !== "canceled")
      .sort((a, b) => rank(a.status) - rank(b.status))[0] ?? null;

  // With nothing picked the rail speaks for the fleet, so the liveliest scout
  // stands in — otherwise a shopper with minutes still meets a buy slider.
  const fleetScout =
    [...scouts].filter((sc) => sc.status !== "canceled").sort((a, b) => rank(a.status) - rank(b.status))[0] ?? null;
  const chosenScout = sending ? scoutFor(sending) : fleetScout;
  const chosenRemaining = chosenScout
    ? chosenScout.dedicatedMinutes > 0
      ? chosenScout.dedicatedMinutes
      : runway
    : balance;
  // Time already paid for is time we must not ask to be paid for again.
  const hasTime = chosenRemaining > 0;
  // The status rows already carry each scout's budget; a summary above them
  // would say the same thing twice.

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
          if (stale) return;
          setPriceUSD(q.priceUSD);
          const floor = q.minChargeableMinutes || MIN_MINUTES;
          setFloorMinutes(floor);
          if (minutesRef.current < floor) {
            minutesRef.current = floor;
            setMinutes(floor);
          }
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
      const next = Math.min(CEILING, Math.max(floorMinutes, Math.round(v)));
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

  const trigger = (
    <button
      type="button"
      className="hsk-cb-scout-rail-trigger"
      onClick={() => (open ? close() : setOpen(true))}
      aria-label="Scouts"
      aria-expanded={open}
    >
      <span
        className="hsk-cb-scout-trigger-icon"
        style={{ color: activeCount > 0 ? "#10b981" : undefined }}
      >
        <FluidIcon size={13} active={activeCount > 0} />
      </span>
      <span>{activeCount > 0 ? tr("scoutInMotion", { n: String(activeCount) }) : tr("scoutsTitle")}</span>
      {activeCount > 0 && <span className="hsk-cb-scout-trigger-dot" />}
    </button>
  );

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
                  !paidAvatars.has(id) && !isLive(id) && "is-unpaid",
                )}
                onClick={() => {
                  setPicked(id);
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
                  mood={moodFor(id)}
                  size={26}
                  paused={paused}
                />
              </button>
            ))}
            <button
              type="button"
              className="hsk-cb-scout-dock-new"
              onClick={() => {
                setPicked(null);
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
        ) : trigger}
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

          <div className="hsk-cb-scout-hatch">
            <div className="hsk-cb-scout-hatch-row">
              {SPECIES_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "hsk-cb-scout-hatch-pick",
                    picked === id && "is-on",
                    isLive(id) && "is-live",
                    !paidAvatars.has(id) && !isLive(id) && picked !== id && "is-unpaid",
                  )}
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
                    mood={picked === id ? "watching" : moodFor(id)}
                    size={30}
                    paused={paused}
                  />
                  <span className="hsk-cb-scout-nick">
                    {speciesNick(id, id)}
                  </span>
                </button>
              ))}
            </div>
          </div>


            <div className="hsk-cb-scout-pool-line">
              <span className="hsk-cb-scout-pool-tag">{tr("scoutPool")}</span>
              {sharing ? (
                <>
                  {humanMinutes(balance, tr)} · ~{humanMinutes(runway, tr)} {tr("scoutPoolEach")}
                </>
              ) : (
                <span>{humanMinutes(balance, tr)}</span>
              )}
            </div>

        {picked && isLive(picked) ? (
          (() => {
            const sc = scoutFor(picked)!;
            const left = minutesOf(sc);
            return (
              <button
                type="button"
                className="hsk-cb-scout-standing"
                onClick={() => onAsk?.(sc)}
                aria-label={`What ${speciesNick(sc.id, sc.avatar)} has been doing`}
              >
                <span className="hsk-cb-scout-face">
                  <ScoutCharacter scoutId={sc.id} avatar={sc.avatar} mood={moodOf(sc)} size={38} paused={paused} />
                </span>
                <span className={cn("hsk-cb-scout-state", `is-${sc.status}`)}>
                  {sc.status === "active"
                    ? tr("scoutStateWatching")
                    : sc.status === "triggered"
                      ? tr("scoutStateSuccess")
                      : sc.status === "paused"
                        ? tr("scoutStatePaused")
                        : sc.status === "idle"
                          ? tr("scoutStateReady")
                          : tr("scoutStateEnded")}
                </span>
                <span className="hsk-cb-scout-clockline">
                  <span className="hsk-cb-scout-cell">
                    <b>{humanMinutes(left, tr)}</b>
                    <u>{tr("scoutLeftLabel")}</u>
                  </span>
                </span>
              </button>
            );
          })()
        ) : (
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
              min={floorMinutes}
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
                min={floorMinutes}
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
        )}

        <div className="hsk-cb-scout-go-row">
        <button
          type="button"
          className="hsk-cb-scout-buy-go"
          disabled={buying || (waiting ? false : !picked)}
          onClick={() => {
            if (waiting) {
              setPicked(null);
              close();
              onNew?.(sending ?? "");
              return;
            }
            if (!client || !picked || buying) return;
            setBuying(true);
            setBuyErr(null);
            const fail = (e: any) => {
              setBuying(false);
              setBuyErr(e?.message || "Checkout is unavailable right now.");
            };
            try {
              client.scouts
                .checkout({
                  minutes,
                  avatar: picked,
                  returnUrl: window.location.href,
                })
                .then(({ url }) => window.location.assign(url))
                .catch(fail);
            } catch (e) {
              fail(e);
            }
          }}
        >
          {buying
            ? tr("scoutOpeningCheckout")
            : waiting
              ? sending
                ? tr("scoutSendOut", { who: speciesNick(sending, sending) })
                : tr("scoutSendItOut")
              : picked
                ? tr("scoutBuyTime")
                : tr("scoutPickAvatar")}
        </button>

        </div>

        {buyErr && <div className="hsk-cb-error">{buyErr}</div>}
      </div>
      {!compact && trigger}
    </div>
  );
}
