import React, { useState, useRef, useEffect } from "react";
import "./App.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("http://localhost:4000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
        signal: controller.signal,
      });

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        
        while (boundary !== -1) {
          const message = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);

          if (message.startsWith("data: ")) {
            const dataStr = message.slice(6);
            if (dataStr === "[DONE]") {
              setIsLoading(false);
              break;
            }

            try {
              const data = JSON.parse(dataStr);
              accumulatedContent += data.content;

              setMessages((prev) => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: accumulatedContent,
                };
                return newMessages;
              });
            } catch (e) {
              console.error("JSON 파싱 에러:", e);
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Stream stopped by user");
      } else {
        console.error("Streaming error:", error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Gemini AI Chat</h1>
      </header>

      <div className="messages-list" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
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
                            backgroundColor: "#282c34"
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

              {isLoading && i === messages.length - 1 && (
                <span className="cursor" />
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="input-area">
        <div className="input-wrapper">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="AI에게 무엇이든 물어보세요..."
            disabled={isLoading}
          />
        </div>
        {isLoading ? (
          <button type="button" onClick={handleStop} className="stop-button">
            중단
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            전송
          </button>
        )}
      </form>
    </div>
  );
}

export default App;
