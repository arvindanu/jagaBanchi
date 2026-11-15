
"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ArrowUp, Plus, Sparkles, Wifi, WifiOff } from "lucide-react";

type Role = "user" | "assistant";
type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

const STORAGE_KEY = "jaga-chat-history-v1";
const MAX_MESSAGE_LENGTH = 12000;

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function saveWithQuotaRecovery(messages: Message[]) {
  const serialized = JSON.stringify(messages);

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    return messages;
  } catch (error) {
    // Only prune history after the browser reports a storage write failure.
    if (
      !(error instanceof DOMException) ||
      !["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(error.name)
    ) {
      throw error;
    }

    const trimmed = [...messages];

    while (trimmed.length > 1) {
      trimmed.shift();

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        return trimmed;
      } catch (retryError) {
        if (
          !(retryError instanceof DOMException) ||
          !["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(
            retryError.name
          )
        ) {
          throw retryError;
        }
      }
    }

    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [connectionError, setConnectionError] = useState("");

  const appShellRef = useRef<HTMLElement>(null);
  const chatAreaRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load saved chat history.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed)) {
          setMessages(
            parsed.filter(
              (item) =>
                item &&
                (item.role === "user" || item.role === "assistant") &&
                typeof item.content === "string"
            )
          );
        }
      }
    } catch {
      setStorageNotice("Couldn't read saved chat history in this browser.");
    }

    setHydrated(true);
  }, []);

  // Handle mobile keyboard and Visual Viewport changes.
  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) return;

    const updateViewport = () => {
      const shell = appShellRef.current;

      if (!shell) return;

      shell.style.setProperty(
        "--visual-viewport-height",
        `${viewport.height}px`
      );

      shell.style.setProperty(
        "--visual-viewport-top",
        `${viewport.offsetTop}px`
      );
    };

    updateViewport();

    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);

    window.addEventListener("orientationchange", updateViewport);

    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  // Scroll only the conversation area, not the whole page.
  useEffect(() => {
    const chatArea = chatAreaRef.current;

    if (!chatArea) return;

    chatArea.scrollTo({
      top: chatArea.scrollHeight,
      behavior: "auto",
    });
  }, [messages, isLoading]);

  // Save chat history locally.
  useEffect(() => {
    if (!hydrated) return;

    try {
      const saved = saveWithQuotaRecovery(messages);

      if (saved.length < messages.length) {
        setMessages(saved);
        setStorageNotice(
          "Browser storage was full, so the oldest messages were cleared."
        );
      }
    } catch {
      setStorageNotice("Couldn't save this chat to browser storage.");
    }
  }, [messages, hydrated]);

  // Cancel an active request when the component unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const startNewChat = useCallback(() => {
    if (isLoading) abortRef.current?.abort();

    setIsLoading(false);
    setMessages([]);
    setInput("");
    setConnectionError("");
    setStorageNotice("");
    textareaRef.current?.focus();
  }, [isLoading]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    const text = input.trim();

    if (!text || isLoading) return;

    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: text.slice(0, MAX_MESSAGE_LENGTH),
      createdAt: Date.now(),
    };

    const assistantMessage: Message = {
      id: makeId(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setInput("");
    setConnectionError("");
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({
            role,
            content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "JAGA couldn't connect. Check your API setup."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();

          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);

            if (parsed.error) throw new Error(parsed.error);

            if (parsed.text) {
              answer += parsed.text;

              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessage.id
                    ? { ...message, content: answer }
                    : message
                )
              );
            }
          } catch (parseError) {
            if (
              parseError instanceof Error &&
              parseError.message !== "Unexpected end of JSON input"
            ) {
              if (
                parseError.message !== "Unexpected token" &&
                !parseError.message.includes("JSON")
              ) {
                throw parseError;
              }
            }
          }
        }
      }

      if (!answer) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content:
                    "Bro, I got absolutely nothing. Try that again? 💀",
                }
              : message
          )
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;

      const message =
        error instanceof Error ? error.message : "Something went sideways.";

      setConnectionError(message);

      setMessages((current) =>
        current.filter((item) => item.id !== assistantMessage.id)
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <main className="app-shell" ref={appShellRef}>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="JAGA home">
          <span className="brand-mark">J</span>
          <span className="brand-name">
            JAGA<span className="brand-period">.</span>
          </span>
        </Link>

        <div className="topbar-right">
          <span className="status">
            <span className="status-dot" /> YOUR FRIEND, ONLINE
          </span>

          <button
            className="new-chat-button"
            onClick={startNewChat}
            aria-label="Start a new chat"
            title="New chat"
          >
            <Plus size={16} strokeWidth={2} />
            <span>NEW CHAT</span>
          </button>
        </div>
      </header>

      <section
        className={`chat-area ${messages.length ? "has-messages" : ""}`}
        ref={chatAreaRef}
      >
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="eyebrow">
              <Sparkles size={13} /> THE FRIEND WHO TALKS BACK
            </div>

            <h1>
              What&apos;s up,
              <br />
              <span>bro?</span>
            </h1>

            <p className="welcome-copy">
              No customer-service energy. Just questionable advice, elite
              banter, and actual support when life gets real.
            </p>

            <div className="prompt-list">
              <button
                onClick={() => setInput("Bro, entertain me. I'm bored.")}
              >
                I’m bored. Entertain me. <span>↗</span>
              </button>

              <button
                onClick={() =>
                  setInput("I need help figuring something out.")
                }
              >
                Help me figure something out <span>↗</span>
              </button>

              <button
                onClick={() => setInput("Can I vent for a minute?")}
              >
                I need to get something off my chest <span>↗</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="message-list">
            <div className="conversation-label">
              THE CONVERSATION <span>·</span>{" "}
              {messages.filter((m) => m.role === "user").length} MESSAGES
            </div>

            {messages.map((message) => (
              <article
                className={`message-row ${message.role}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="avatar">J</div>
                )}

                <div className="message-content">
                  <div className="message-meta">
                    {message.role === "user" ? "YOU" : "JAGA"}
                  </div>

                  <div className="message-bubble">
                    {message.content ||
                      (isLoading ? (
                        <span className="typing">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        ""
                      ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="composer-wrap">
        {connectionError && (
          <div className="inline-error">
            <WifiOff size={14} /> {connectionError}
          </div>
        )}

        {storageNotice && (
          <div className="storage-notice">{storageNotice}</div>
        )}

        <form className="composer" onSubmit={sendMessage}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Say something. Make it interesting..."
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="Message JAGA"
            disabled={isLoading}
          />

          <button
            className="send-button"
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
          >
            <ArrowUp size={19} strokeWidth={2.2} />
          </button>
        </form>

        <div className="composer-caption">
          <span>
            <Wifi size={11} /> PRIVATE TO THIS BROWSER
          </span>
          <span>
            ENTER TO SEND <b>·</b> SHIFT + ENTER FOR NEW LINE
          </span>
        </div>
      </footer>

      <div className="bottom-note">
        <span>JAGA © 2026</span>
        <span>LESS FILTER. MORE PERSONALITY.</span>
      </div>
    </main>
  );
}
