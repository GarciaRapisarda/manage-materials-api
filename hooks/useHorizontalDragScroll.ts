import { useCallback, useEffect, useRef, useState } from "react";

const INTERACTIVE_SELECTOR =
  "button, input, a, select, textarea, label, [contenteditable='true']";

export function useHorizontalDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [canScroll, setCanScroll] = useState(false);

  const updateCanScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateCanScroll();
    const observer = new ResizeObserver(updateCanScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateCanScroll]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || !canScroll) return;
      if ((e.target as Element).closest(INTERACTIVE_SELECTOR)) return;

      dragRef.current = {
        active: true,
        startX: e.pageX,
        scrollLeft: el.scrollLeft,
      };
      setIsDragging(true);
    },
    [canScroll]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || !dragRef.current.active) return;
      el.scrollLeft =
        dragRef.current.scrollLeft - (e.pageX - dragRef.current.startX);
    };

    const endDrag = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      setIsDragging(false);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", endDrag);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", endDrag);
    };
  }, []);

  return { ref, onMouseDown, isDragging, canScroll, updateCanScroll };
}
