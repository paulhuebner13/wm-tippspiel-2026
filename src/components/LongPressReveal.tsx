"use client";

import { type ReactNode, useRef, useState } from "react";

type LongPressRevealProps = {
  children: ReactNode;
  reveal: ReactNode;
  className?: string;
  revealClassName?: string;
  delayMs?: number;
};

export function LongPressReveal({
  children,
  reveal,
  className,
  revealClassName,
  delayMs = 5000,
}: LongPressRevealProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function startPress() {
    if (open) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setOpen(true);
      timerRef.current = null;
    }, delayMs);
  }

  return (
    <div
      className={className}
      onPointerDown={startPress}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
      {open && <div className={revealClassName}>{reveal}</div>}
    </div>
  );
}
