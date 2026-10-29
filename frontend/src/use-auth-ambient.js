import { useEffect, useRef } from 'react';

// Keep pointer tracking out of React renders. Frames run only while easing.
export function useAuthAmbient() {
  const panelRef = useRef(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      previousTime = 0,
      inside = false;
    let x = 0,
      y = 0,
      targetX = 0,
      targetY = 0,
      opacity = 0,
      targetOpacity = 0;
    let panelWidth = 1,
      panelHeight = 1;
    const enabled = () => finePointer.matches && !reducedMotion.matches;
    const paint = () => {
      panel.style.setProperty('--ambient-x', `${x.toFixed(2)}px`);
      panel.style.setProperty('--ambient-y', `${y.toFixed(2)}px`);
      panel.style.setProperty('--ambient-opacity', opacity.toFixed(4));
      panel.style.setProperty(
        '--ambient-parallax-x',
        `${((x / panelWidth - 0.5) * 4 * opacity).toFixed(2)}px`,
      );
      panel.style.setProperty(
        '--ambient-parallax-y',
        `${((y / panelHeight - 0.5) * 4 * opacity).toFixed(2)}px`,
      );
    };
    const tick = (time) => {
      const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
      previousTime = time;
      const ease = 1 - Math.exp(-elapsed / 110);
      x += (targetX - x) * ease;
      y += (targetY - y) * ease;
      opacity += (targetOpacity - opacity) * ease;
      paint();
      if (
        Math.abs(targetX - x) > 0.1 ||
        Math.abs(targetY - y) > 0.1 ||
        Math.abs(targetOpacity - opacity) > 0.001
      ) {
        frame = requestAnimationFrame(tick);
      } else {
        x = targetX;
        y = targetY;
        opacity = targetOpacity;
        paint();
        frame = 0;
        previousTime = 0;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const move = (event) => {
      if (!enabled() || event.pointerType !== 'mouse') return;
      const bounds = panel.getBoundingClientRect();
      panelWidth = bounds.width || 1;
      panelHeight = bounds.height || 1;
      targetX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
      targetY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
      if (!inside) {
        x = targetX;
        y = targetY;
        inside = true;
      }
      targetOpacity = 1;
      schedule();
    };
    const leave = () => {
      inside = false;
      targetOpacity = 0;
      schedule();
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      inside = false;
      opacity = targetOpacity = 0;
      paint();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    panel.addEventListener('pointerenter', move);
    panel.addEventListener('pointermove', move);
    panel.addEventListener('pointerleave', leave);
    panel.addEventListener('pointercancel', leave);
    // Scrolling changes the panel-relative position; fade until the next movement.
    window.addEventListener('scroll', leave, { passive: true });
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    finePointer.addEventListener('change', reset);
    reducedMotion.addEventListener('change', reset);
    return () => {
      reset();
      panel.removeEventListener('pointerenter', move);
      panel.removeEventListener('pointermove', move);
      panel.removeEventListener('pointerleave', leave);
      panel.removeEventListener('pointercancel', leave);
      window.removeEventListener('scroll', leave);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      finePointer.removeEventListener('change', reset);
      reducedMotion.removeEventListener('change', reset);
    };
  }, []);
  return panelRef;
}
