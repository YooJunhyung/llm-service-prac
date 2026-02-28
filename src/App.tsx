import React, { useState, useRef, useEffect, memo } from "react";
import "./App.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

interface Message {
  role: "user" | "assistant";
  content: string;
  thought?: string;
}

const STEPS = [
  {
    id: "analyze",
    label: "질문 의도 및 맥락 분석 중",
    keywords: [
      "analyz",
      "understand",
      "intent",
      "query",
      "dissect",
      "goal",
      "clarify",
    ],
  },
  {
    id: "logic",
    label: "논리 구조 및 추론 전개",
    keywords: [
      "reason",
      "logic",
      "think",
      "thought",
      "process",
      "evaluat",
      "assess",
      "consid",
      "argument",
      "structur",
      "plan",
    ],
  },
  {
    id: "detail",
    label: "세부 정보 보완 및 검토",
    keywords: [
      "detail",
      "expand",
      "elabor",
      "refin",
      "improv",
      "polish",
      "correct",
      "review",
      "additional",
    ],
  },
  {
    id: "final",
    label: "최종 답변 작성 및 요약",
    keywords: [
      "synthesiz",
      "draft",
      "formulat",
      "develop",
      "generat",
      "writ",
      "finaliz",
      "conclud",
    ],
  },
];

const MessageItem = memo(
  ({
    msg,
    isLoading,
    isLast,
    currentStepIndex,
  }: {
    msg: Message;
    isLoading: boolean;
    isLast: boolean;
    currentStepIndex: number;
  }) => {
    const showThinkingUI =
      msg.role === "assistant" && !msg.content && isLast && isLoading;

    return (
      <div className={`message ${msg.role}`} style={{ paddingBottom: "1rem" }}>
        <div className="message-bubble">
          {showThinkingUI && (
            <div className="thinking-steps">
              {STEPS.map((step, idx) => (
                <div
                  key={step.id}
                  className={`step-item ${
                    idx <= currentStepIndex ? "active" : ""
                  } ${idx < currentStepIndex ? "completed" : ""}`}
                >
                  <div className="step-icon">
                    {idx < currentStepIndex ? (
                      "✓"
                    ) : idx === currentStepIndex ? (
                      <div className="spinner-tiny"></div>
                    ) : (
                      "○"
                    )}
                  </div>
                  <div className="step-label">{step.label}</div>
                </div>
              ))}
            </div>
          )}

          {msg.content && (
            <div className="answer-container">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <div className="code-block-wrapper">
                        <div className="code-lang">{match[1]}</div>
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            borderRadius: "0 0 8px 8px",
                            padding: "1rem",
                            fontSize: "0.9rem",
                            backgroundColor: "#282c34",
                          }}
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          )}
          {isLoading && isLast && msg.content && <span className="cursor" />}
        </div>
      </div>
    );
  }
);

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Throttle을 위한 Refs ---
  const pendingContentRef = useRef("");
  const pendingThoughtRef = useRef("");
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: messages.length - 1,
        align: "end",
        behavior: "auto",
      });
    }
  }, [messages, isLoading, currentStepIndex]);

  const updateStepIndex = (thought: string) => {
    const lowerThought = thought.toLowerCase();
    const len = thought.length;
    let highestMatch = 0;
    STEPS.forEach((step, index) => {
      if (step.keywords.some((k) => lowerThought.includes(k)))
        highestMatch = index;
    });
    const lengthBasedStep = Math.floor(len / 300);
    highestMatch = Math.max(highestMatch, lengthBasedStep);
    setCurrentStepIndex((prev) => {
      const next = Math.max(prev, highestMatch);
      return next > 3 ? 3 : next;
    });
  };

  // UI 상태를 실제로 업데이트하는 함수
  const flushUpdates = () => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastIdx = newMessages.length - 1;
      if (lastIdx < 0) return prev;

      newMessages[lastIdx] = {
        ...newMessages[lastIdx],
        content: pendingContentRef.current,
        thought: pendingContentRef.current ? "" : pendingThoughtRef.current,
      };
      return newMessages;
    });

    if (pendingThoughtRef.current && !pendingContentRef.current) {
      updateStepIndex(pendingThoughtRef.current);
    }
    if (pendingContentRef.current) {
      setCurrentStepIndex(4);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: Message = { role: "user", content: input };
    const historyToSend = [...messages, userMessage];

    // 초기화
    pendingContentRef.current = "";
    pendingThoughtRef.current = "";
    setMessages([
      ...historyToSend,
      { role: "assistant", content: "", thought: "" },
    ]);
    setInput("");
    setIsLoading(true);
    setCurrentStepIndex(0);

    // 50ms마다 UI 업데이트를 수행하는 타이머 시작
    updateTimerRef.current = setInterval(() => {
      flushUpdates();
    }, 50);

    try {
      const response = await fetch("http://localhost:4000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyToSend }),
        signal: controller.signal,
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary).trim();
          console.log(message);
          buffer = buffer.slice(boundary + 2);

          if (message.startsWith("data: ")) {
            const dataStr = message.slice(6);
            if (dataStr === "[DONE]") break;
            try {
              const data = JSON.parse(dataStr);
              // 데이터를 리액트 상태가 아닌 Ref 버퍼에 저장 (매우 빠름)
              if (data.thought) pendingThoughtRef.current += data.thought;
              if (data.content) pendingContentRef.current += data.content;
            } catch (e) {
              console.error("JSON Error:", e);
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error: any) {
      if (error.name !== "AbortError") console.error("Streaming error:", error);
    } finally {
      // 종료 시 타이머 정리 및 최종 데이터 반영
      if (updateTimerRef.current) clearInterval(updateTimerRef.current);
      flushUpdates();
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Gemini Reasoning Chat</h1>
      </header>

      <div className="messages-list-wrapper">
        <Virtuoso
          ref={virtuosoRef}
          data={messages}
          followOutput="smooth"
          increaseViewportBy={200}
          itemContent={(index, msg) => (
            <MessageItem
              msg={msg}
              isLoading={isLoading}
              isLast={index === messages.length - 1}
              currentStepIndex={currentStepIndex}
            />
          )}
          components={{
            Header: () => <div style={{ height: "1.5rem" }} />,
            Footer: () => <div style={{ height: "1.5rem" }} />,
          }}
        />
      </div>

      <form onSubmit={handleSubmit} className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          {isLoading ? "생각 중" : "전송"}
        </button>
      </form>
    </div>
  );
}

export default App;
