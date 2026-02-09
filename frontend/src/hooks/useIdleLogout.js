import { useEffect, useRef, useCallback } from "react";

const IDLE_TIME = 15 * 60 * 1000; // 15 minutos
// para pruebas puedes usar: 15 * 1000

export default function useIdleLogout({ isActive, logout }) {
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    if (!isActive) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      logout();
    }, IDLE_TIME);
  }, [isActive, logout]);

  useEffect(() => {
    if (!isActive) return;

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    resetTimer();

    events.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((event) =>
        window.removeEventListener(event, resetTimer)
      );
    };
  }, [isActive, resetTimer]);
}
