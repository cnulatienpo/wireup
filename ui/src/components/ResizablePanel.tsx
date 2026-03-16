import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ResizablePanelProps = {
  className?: string;
  style?: CSSProperties;
  minWidth?: number;
  minHeight?: number;
  children: ReactNode;
};

const ResizablePanel = ({
  className,
  style,
  minWidth = 200,
  minHeight = 120,
  children,
}: ResizablePanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pixelStyle, setPixelStyle] = useState<CSSProperties | null>(null);

  const startResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      const panel = panelRef.current;
      const parent = panel?.offsetParent as HTMLElement | null;
      if (!panel || !parent) return;

      const rect = panel.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = rect.width;
      const startHeight = rect.height;

      const anchoredStyle: CSSProperties = {
        top: `${rect.top - parentRect.top}px`,
        left: `${rect.left - parentRect.left}px`,
        width: `${startWidth}px`,
        height: `${startHeight}px`,
      };

      setPixelStyle(anchoredStyle);

      const resize = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        setPixelStyle((prevStyle) => ({
          ...(prevStyle ?? anchoredStyle),
          width: `${Math.max(minWidth, startWidth + dx)}px`,
          height: `${Math.max(minHeight, startHeight + dy)}px`,
        }));
      };

      const stopResize = () => {
        window.removeEventListener("mousemove", resize);
        window.removeEventListener("mouseup", stopResize);
      };

      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResize);
    },
    [minHeight, minWidth],
  );

  return (
    <div ref={panelRef} className={cn("panel", className)} style={pixelStyle ?? style}>
      <div className="panel-content">{children}</div>
      <div
        className="resize-handle"
        onMouseDown={startResize}
        role="button"
        aria-label="Resize panel"
        tabIndex={-1}
      />
    </div>
  );
};

export default ResizablePanel;
