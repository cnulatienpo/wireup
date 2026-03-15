import { useRef, useCallback, useState } from "react";
import cardboardUI from "@/assets/FINISHED_UI.png";
import wireBelt from "@/assets/WIRE_BELT.svg";
import LeftPanel from "@/components/LeftPanel";
import BottomLeftPanel from "@/components/BottomLeftPanel";

const Index = () => {
  const RESTART_DISABLED = true;
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ bottom: 13, left: 3.5 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, bottom: 0, left: 0 });
  const hasDragged = useRef(false);

  const [userInput, setUserInput] = useState("");
  const [response, setResponse] = useState("");
  const [context, setContext] = useState("No context loaded.");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    // Mock LLM response for now
    setTimeout(() => {
      setResponse(prev =>
        (prev ? prev + "\n\n" : "") +
        `> ${userInput}\n\nThis is a mock response. Connect the LLM backend to get real answers.`
      );
      setContext(`Last prompt: "${userInput.slice(0, 80)}${userInput.length > 80 ? "..." : ""}"\nTokens: ~${Math.ceil(userInput.split(/\s+/).length * 1.3)}\nModel: not connected`);
      setUserInput("");
      setIsLoading(false);
    }, 600);
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, bottom: pos.bottom, left: pos.left };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    hasDragged.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100;
    setPos({
      left: dragStart.current.left + dx,
      bottom: dragStart.current.bottom - dy,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const panelText: React.CSSProperties = {
    fontSize: "clamp(8px, 1.4vw, 15px)",
    lineHeight: 1.5,
    fontFamily: "'Courier New', monospace",
    padding: "4% 5%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div ref={containerRef} className="relative w-full max-w-[900px]">
        <img
          src={cardboardUI}
          alt="Cardboard UI"
          className="w-full h-auto block"
        />
        <img
          src={wireBelt}
          alt="Wire Belt"
          className="absolute"
          style={{
            bottom: "6.4%",
            right: "8.6%",
            width: "20%",
            height: "auto",
          }}
        />
        {/* Left panel */}
        <div
          className="absolute overflow-y-auto cardboard-scroll"
          style={{
            top: "16%",
            left: "3.5%",
            width: "12%",
            height: "70%",
          }}
        >
          <LeftPanel />
        </div>
        {/* Bottom-left black rectangle panel */}
        <div
          className="absolute overflow-y-auto cardboard-scroll"
          style={{
            top: "73%",
            left: "3.5%",
            width: "12%",
            height: "13%",
          }}
        >
          <BottomLeftPanel />
        </div>
        {/* White panel - LLM response */}
        <div
          className="absolute overflow-y-auto cardboard-scroll"
          style={{
            top: "16%",
            left: "17%",
            width: "50%",
            height: "54%",
          }}
        >
          <div style={{ ...panelText, color: "#2a2a2a" }}>
            {response || <span style={{ opacity: 0.4 }}>Waiting for input...</span>}
          </div>
        </div>
        {/* Black panel - user input */}
        <div
          className="absolute overflow-y-auto cardboard-scroll flex"
          style={{
            top: "73%",
            left: "17%",
            width: "50%",
            height: "13%",
          }}
        >
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Type here..."
            className="flex-1 bg-transparent border-none outline-none resize-none text-white placeholder:text-white/30"
            style={{
              fontSize: "clamp(8px, 1.4vw, 15px)",
              lineHeight: 1.5,
              fontFamily: "'Courier New', monospace",
              padding: "3% 4%",
            }}
          />
          {/* Hand-drawn arrow submit button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading || !userInput.trim()}
            className="self-end shrink-0 opacity-70 hover:opacity-100 transition-opacity disabled:opacity-20"
            style={{
              width: "12%",
              padding: "2%",
            }}
            aria-label="Send"
          >
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Hand-drawn arrow */}
              <path
                d="M6 22 C10 21, 20 20, 28 20 C26 16, 24 13, 22 10 M28 20 C26 24, 24 27, 22 30 M7 21 C12 22, 18 21, 28 20"
                stroke="hsl(30, 30%, 60%)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
        {/* Yellow panel - context window */}
        <div
          className="absolute overflow-y-auto cardboard-scroll"
          style={{
            top: "16%",
            right: "6%",
            width: "22%",
            height: "54%",
          }}
        >
          <div style={{ ...panelText, color: "#3d3520", fontSize: "clamp(7px, 1.1vw, 12px)" }}>
            <strong style={{ fontSize: "clamp(8px, 1.2vw, 13px)", textDecoration: "underline" }}>CONTEXT</strong>
            <br /><br />
            {context}
          </div>
        </div>
        {/* Draggable Restart button overlay */}
        <button
          disabled={RESTART_DISABLED}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(e) => {
            if (RESTART_DISABLED) { e.preventDefault(); return; }
            if (hasDragged.current) { e.preventDefault(); return; }
            sessionStorage.clear();
            localStorage.clear();
            window.location.reload();
          }}
          className="absolute rounded-full cursor-grab active:cursor-grabbing bg-red-500/30 border-2 border-dashed border-red-400 flex items-center justify-center select-none touch-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            bottom: `${pos.bottom}%`,
            left: `${pos.left}%`,
            width: "9%",
            aspectRatio: "1",
            fontSize: "clamp(7px, 1.3vw, 16px)",
            fontWeight: 900,
            color: "white",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
          aria-label="Restart"
          title={RESTART_DISABLED ? "Restart temporarily disabled" : "Drag to position, click to restart"}
        >
          Restart
        </button>
      </div>
    </div>
  );
};

export default Index;
