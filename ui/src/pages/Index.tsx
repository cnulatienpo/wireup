import { useState, type CSSProperties } from "react";

import wireBelt from "@/assets/WIRE_BELT.svg";
import cardboardUI from "@/assets/FINISHED_UI.png";
import BottomLeftPanel from "@/components/BottomLeftPanel";
import LeftPanel from "@/components/LeftPanel";
import ResizablePanel from "@/components/ResizablePanel";

const Index = () => {
  const [userInput, setUserInput] = useState("");
  const [response, setResponse] = useState("");
  const [context, setContext] = useState("No context loaded.");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = () => {
    if (!userInput.trim()) return;

    setIsLoading(true);

    setTimeout(() => {
      setResponse(
        (prev) =>
          (prev ? `${prev}\n\n` : "") +
          `> ${userInput}\n\nThis is a mock response. Connect the LLM backend to get real answers.`,
      );
      setContext(
        `Last prompt: "${userInput.slice(0, 80)}${userInput.length > 80 ? "..." : ""}"\nTokens: ~${Math.ceil(userInput.split(/\s+/).length * 1.3)}\nModel: not connected`,
      );
      setUserInput("");
      setIsLoading(false);
    }, 600);
  };

  const panelText: CSSProperties = {
    fontSize: "clamp(8px, 1.4vw, 15px)",
    lineHeight: 1.5,
    fontFamily: "'Courier New', monospace",
    padding: "4% 5%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="relative isolate w-full max-w-[900px] panel-canvas">
        <img
          src={wireBelt}
          alt="Wire Belt"
          className="absolute z-0 pointer-events-none"
          style={{
            bottom: "6.4%",
            right: "8.6%",
            width: "20%",
            height: "auto",
          }}
        />
        <img src={cardboardUI} alt="Cardboard UI" className="relative z-10 w-full h-auto block" />

        <ResizablePanel
          className="z-20 overflow-y-auto cardboard-scroll"
          style={{
            top: "16%",
            left: "3.5%",
            width: "12%",
            height: "70%",
          }}
        >
          <LeftPanel />
        </ResizablePanel>

        <ResizablePanel
          className="z-20 overflow-y-auto cardboard-scroll"
          style={{
            top: "73%",
            left: "3.5%",
            width: "12%",
            height: "13%",
          }}
        >
          <BottomLeftPanel />
        </ResizablePanel>

        <ResizablePanel
          className="z-20 overflow-y-auto cardboard-scroll"
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
        </ResizablePanel>

        <ResizablePanel
          className="z-20 overflow-y-auto cardboard-scroll flex"
          style={{
            top: "73%",
            left: "17%",
            width: "50%",
            height: "13%",
          }}
        >
          <textarea
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
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
        </ResizablePanel>

        <ResizablePanel
          className="z-20 overflow-y-auto cardboard-scroll"
          style={{
            top: "16%",
            right: "6%",
            width: "22%",
            height: "54%",
          }}
        >
          <div style={{ ...panelText, color: "#3d3520", fontSize: "clamp(7px, 1.1vw, 12px)" }}>
            <strong style={{ fontSize: "clamp(8px, 1.2vw, 13px)", textDecoration: "underline" }}>
              CONTEXT
            </strong>
            <br />
            <br />
            {context}
          </div>
        </ResizablePanel>

        <button
          disabled
          className="absolute z-20 rounded-full bg-red-500/20 border-2 border-dashed border-red-400 flex items-center justify-center select-none touch-none opacity-35 cursor-not-allowed pointer-events-none"
          style={{
            bottom: "13%",
            left: "calc(3.5% + 48px)",
            width: "9%",
            aspectRatio: "1",
            fontSize: "clamp(7px, 1.3vw, 16px)",
            fontWeight: 900,
            color: "white",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
          aria-label="Restart"
          title="Restart temporarily disabled"
        >
          Restart
        </button>
      </div>
    </div>
  );
};

export default Index;
