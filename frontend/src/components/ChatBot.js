import React, { useState, useRef, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.REACT_APP_API_URL;
const WELCOME = {
  id: 0,
  from: "bot",
  text: "Hi! I'm your AI Governance assistant. Ask me anything about costs, alerts, security, or how to use this platform.",
};

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, typing]);

  async function send() {
    const text = input.trim();
    if (!text) return;

    const userMsg = { id: Date.now(), from: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // Build history from current messages (exclude welcome, last 10)
    const history = messages
      .slice(1)
      .slice(-10)
      .map((m) => ({
        role: m.from === "bot" ? "assistant" : "user",
        text: m.text,
      }));

    try {
      const { data } = await axios.post(`${API_BASE}/api/v1/chat`, {
        message: text,
        history,
      });
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, from: "bot", text: data.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          from: "bot",
          text: "Sorry, I'm having trouble connecting. Please try again.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {open && (
        <div
          className={`chatbot-panel${expanded ? " chatbot-panel-expanded" : ""}`}
        >
          <div className="chatbot-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src="/bot.avif"
                alt="Bot"
                className="chatbot-header-avatar"
              />
              <div>
                <div className="chatbot-header-title">AI Assistant</div>
                <div className="chatbot-header-sub">Always here to help</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                className="chatbot-close"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? "Collapse chat" : "Expand chat"}
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="10" y1="14" x2="3" y2="21" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button
                className="chatbot-close"
                onClick={() => {
                  setOpen(false);
                  setExpanded(false);
                }}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="chatbot-messages">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chatbot-bubble ${m.from === "bot" ? "chatbot-bubble-bot" : "chatbot-bubble-user"}`}
              >
                {m.from === "bot" && (
                  <img
                    src="/bot.avif"
                    alt=""
                    className="chatbot-bubble-avatar"
                  />
                )}
                <span>{m.text}</span>
              </div>
            ))}
            {typing && (
              <div className="chatbot-bubble chatbot-bubble-bot">
                <img src="/bot.avif" alt="" className="chatbot-bubble-avatar" />
                <span className="chatbot-typing">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chatbot-input-row">
            <input
              className="chatbot-input"
              placeholder="Ask me anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={typing}
            />
            <button
              className="chatbot-send"
              onClick={send}
              disabled={!input.trim() || typing}
              aria-label="Send"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <button
        className="chatbot-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open AI assistant"
      >
        <img src="/bot.avif" alt="" className="chatbot-fab-img" />
      </button>
    </>
  );
}
