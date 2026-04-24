"use client";

import { useEffect, useLayoutEffect, useState } from "react";

export type TourStep = {
  selector: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export type TourGuideProps = {
  steps: TourStep[];
  storageKey: string; // remembers "this user finished the tour"
};

const BUBBLE_W = 320;
const BUBBLE_H_EST = 170;

export function TourGuide({ steps, storageKey }: TourGuideProps) {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; placement: string } | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Auto-start for first-time visitors.
  useEffect(() => {
    const done = typeof window !== "undefined" && window.localStorage.getItem(storageKey + ":done");
    if (!done) setActive(true);
  }, [storageKey]);

  useLayoutEffect(() => {
    if (!active) return;
    const step = steps[idx];
    if (!step) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    // Try to find the element; retry briefly if not rendered yet.
    const tryAttach = (retries = 10) => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        if (retries > 0) setTimeout(() => tryAttach(retries - 1), 120);
        return;
      }
      el.classList.add("tour-target");
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setPos(computePos(rect, step.placement ?? "bottom"));
      cleanup = () => el.classList.remove("tour-target");

      const onUpdate = () => {
        const r = el.getBoundingClientRect();
        setTargetRect(r);
        setPos(computePos(r, step.placement ?? "bottom"));
      };
      window.addEventListener("resize", onUpdate);
      window.addEventListener("scroll", onUpdate, true);
      const prevCleanup = cleanup;
      cleanup = () => {
        prevCleanup?.();
        window.removeEventListener("resize", onUpdate);
        window.removeEventListener("scroll", onUpdate, true);
      };
    };
    tryAttach();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [active, idx, steps]);

  function finish() {
    setActive(false);
    try { window.localStorage.setItem(storageKey + ":done", "1"); } catch {}
  }

  if (!active) {
    return (
      <button
        onClick={() => { setActive(true); setIdx(0); }}
        className="btn-secondary"
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          padding: "8px 14px", fontSize: 12,
          boxShadow: "0 2px 6px rgba(30, 42, 36, 0.1)",
        }}
      >
        ✨ 튜토리얼 다시 시작
      </button>
    );
  }

  const step = steps[idx];
  if (!step) return null;
  const isLast = idx === steps.length - 1;

  return (
    <>
      {/* dimmed backdrop with a cut-out around target */}
      {targetRect && (
        <>
          <div style={{
            position: "fixed", left: 0, top: 0, right: 0, height: targetRect.top,
            background: "rgba(30, 42, 36, 0.18)", zIndex: 40, pointerEvents: "none",
          }} />
          <div style={{
            position: "fixed", left: 0, top: targetRect.bottom,
            right: 0, bottom: 0,
            background: "rgba(30, 42, 36, 0.18)", zIndex: 40, pointerEvents: "none",
          }} />
          <div style={{
            position: "fixed", left: 0, top: targetRect.top,
            width: targetRect.left, height: targetRect.height,
            background: "rgba(30, 42, 36, 0.18)", zIndex: 40, pointerEvents: "none",
          }} />
          <div style={{
            position: "fixed", left: targetRect.right, top: targetRect.top,
            right: 0, height: targetRect.height,
            background: "rgba(30, 42, 36, 0.18)", zIndex: 40, pointerEvents: "none",
          }} />
        </>
      )}

      {/* bubble */}
      {pos && (
        <div
          className={`tour-bubble from-${pos.placement}`}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: BUBBLE_W,
            zIndex: 60,
          }}
          role="dialog"
          aria-live="polite"
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 22, height: 22, borderRadius: 11,
              background: "var(--accent-dark)", color: "white",
              fontSize: 11, fontWeight: 800,
            }}>{idx + 1}</span>
            <strong style={{ fontSize: 14 }}>{step.title}</strong>
            <span style={{ flex: 1 }} />
            <button
              onClick={finish}
              aria-label="닫기"
              style={{
                background: "transparent", color: "var(--muted)",
                padding: 0, fontSize: 16, fontWeight: 400,
              }}
            >×</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
            {step.body}
          </div>
          <div style={{
            display: "flex", gap: 6, alignItems: "center",
            marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10,
          }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {idx + 1} / {steps.length}
            </span>
            <span style={{ flex: 1 }} />
            {idx > 0 && (
              <button
                className="btn-secondary"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                style={{ fontSize: 12, padding: "4px 10px" }}
              >← 이전</button>
            )}
            <button
              onClick={() => {
                if (isLast) finish();
                else setIdx((i) => i + 1);
              }}
              style={{ fontSize: 12, padding: "4px 14px" }}
            >
              {isLast ? "완료" : "다음 →"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function computePos(
  rect: DOMRect,
  placement: "top" | "bottom" | "left" | "right",
): { top: number; left: number; placement: string } {
  let top = 0, left = 0;
  if (placement === "bottom") {
    top = rect.bottom + 14;
    left = rect.left;
  } else if (placement === "top") {
    top = rect.top - BUBBLE_H_EST - 14;
    left = rect.left;
  } else if (placement === "right") {
    top = rect.top;
    left = rect.right + 14;
  } else {
    top = rect.top;
    left = rect.left - BUBBLE_W - 14;
  }
  // clamp to viewport
  const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const winH = typeof window !== "undefined" ? window.innerHeight : 800;
  left = Math.max(10, Math.min(left, winW - BUBBLE_W - 10));
  top = Math.max(10, Math.min(top, winH - BUBBLE_H_EST - 10));
  return { top, left, placement };
}
