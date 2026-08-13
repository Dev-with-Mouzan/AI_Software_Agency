"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Bot,
  MessageSquareText,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { useChat, useProjects } from "@/lib/hooks";
import type { ChatResponse } from "@/lib/types";
import { humanizeChatReply } from "@/lib/chat";
import { timeAgo } from "@/lib/format";

interface Message {
  id: number;
  role: "user" | "agent";
  content: string;
  agent_kind?: string;
  agent?: string;
  needs_human?: boolean;
  actions?: Record<string, unknown>[];
  created_at?: string;
}

const WELCOME: Message = {
  id: 0,
  role: "agent",
  agent_kind: "routing",
  agent: "DevPilot router",
  content:
    "I route your message to the right agent automatically. What would you like to delegate?",
};

export function GlobalChatbot() {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/chat");

  const projects = useProjects();
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const idRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  const send = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    const userMessage: Message = {
      id: idRef.current++,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    chat.mutate(
      {
        message: text,
        project_id: projectId || undefined,
      },
      {
        onSuccess: (response: ChatResponse) => {
          setMessages((prev) => [
            ...prev,
            {
              id: idRef.current++,
              role: "agent",
              content: humanizeChatReply(response.reply),
              agent_kind: response.agent_kind,
              agent: response.agent,
              needs_human: response.needs_human,
              actions: response.actions,
              created_at: response.created_at,
            },
          ]);
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            {
              id: idRef.current++,
              role: "agent",
              agent_kind: "routing",
              agent: "System",
              content: humanizeChatReply(`⚠ ${(error as Error).message}`),
            },
          ]);
        },
      },
    );
  };

  return (
    <AnimatePresence initial={false}>
      {!hidden && (
        <motion.div
          key="global-chatbot"
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.4 }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-40 sm:bottom-6 sm:right-6"
        >
          <AnimatePresence>
            {open && (
              <>
                <motion.button
                  type="button"
                  aria-label="Close chat"
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="fixed inset-0 z-40 bg-overlay backdrop-blur-sm"
                />
                <motion.div
                  role="dialog"
                  aria-label="Chat with your AI team"
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="glass-strong fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-3 right-3 z-50 flex h-[min(560px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-2xl border border-edge shadow-pop sm:bottom-24 sm:left-auto sm:right-6 sm:h-[min(540px,calc(100dvh-8rem))] sm:w-[calc(100vw-2.5rem)] sm:max-w-[390px]"
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 border-b border-edge-soft px-4 py-3">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft text-primary">
                      <Sparkles className="h-4 w-4" />
                      <span className="absolute -right-px -top-px h-2 w-2 rounded-full bg-success" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold tracking-tight text-text">
                        Chat
                      </p>
                      <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                        Auto-routed to the right specialist
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close chat"
                      className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div
                    ref={scrollRef}
                    className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
                  >
                    {messages.map((message) => {
                      const isUser = message.role === "user";
                      return (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${isUser
                                ? "border-edge bg-surface-2 text-muted"
                                : "border-primary/30 bg-primary-soft text-primary"
                              }`}
                          >
                            {isUser ? (
                              <User className="h-4 w-4" />
                            ) : (
                              <Bot className="h-4 w-4" />
                            )}
                          </div>
                          <div
                            className={`max-w-[75%] rounded-lg border px-4 py-3 ${isUser
                                ? "border-primary/40 bg-primary-soft"
                                : "border-edge bg-surface-2/70"
                              }`}
                          >
                            {!isUser && (
                              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-display text-xs font-semibold tracking-tight text-text-dim">
                                  {message.agent ?? "Agent"}
                                </span>
                                {message.agent_kind && (
                                  <Badge tone="primary">{message.agent_kind}</Badge>
                                )}
                                {message.needs_human && (
                                  <Badge tone="warning" dot>
                                    needs human
                                  </Badge>
                                )}
                                {message.created_at && (
                                  <span className="font-mono text-[9px] tracking-[0.06em] text-faint">
                                    {timeAgo(message.created_at)}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap text-sm leading-6 text-text-dim">
                              {message.content}
                            </p>
                            {message.actions && message.actions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {message.actions.map((action, i) => (
                                  <code
                                    key={i}
                                    className="rounded border border-edge bg-surface px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-dim"
                                  >
                                    {String(action.tool ?? action.name ?? "tool")}
                                  </code>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                    {chat.isPending && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="flex gap-3"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-hover">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-1.5 rounded-lg border border-edge bg-surface-2 px-4 py-3">
                          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted" />
                          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted [animation-delay:0.3s]" />
                          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-muted [animation-delay:0.6s]" />
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Input */}
                  <form
                    onSubmit={send}
                    className="border-t border-edge-soft bg-surface-2/60 p-3"
                  >
                    <div className="mb-2">
                      <Select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        aria-label="Scope to project"
                        className="w-full"
                      >
                        <option value="">No project context</option>
                        {projects.data?.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask something…"
                        className="flex-1"
                      />
                      <button
                        type="submit"
                        disabled={chat.isPending || !input.trim()}
                        aria-label="Send message"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-ink transition-all duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <div className="relative">
            {/* Breathing glow halo */}
            <span
              aria-hidden
              className="animate-breathe absolute -inset-3 rounded-full bg-primary/25 blur-xl"
            />
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Open AI assistant chat"
              aria-expanded={open}
              className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-ink shadow-pop transition-transform duration-200 hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
            >
              <span className="relative flex items-center justify-center">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={open ? "x" : "icon"}
                    className="flex items-center justify-center"
                    initial={{ rotate: -20, scale: 0.7, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    exit={{ rotate: 20, scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.14 }}
                  >
                    {open ? (
                      <X className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                    ) : (
                      <MessageSquareText
                        className="h-5 w-5 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    )}
                  </motion.span>
                </AnimatePresence>
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-3 w-3"
                  aria-hidden
                >
                  <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-text" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-text" />
                </span>
              </span>
            </button>

            {/* Message chip — always visible so visitors notice the chat */}
            <div className="pointer-events-none absolute bottom-16 right-0 animate-float sm:bottom-[4.7rem]">
              <div className="glass-strong flex min-w-52 items-center justify-between gap-3 whitespace-nowrap rounded-xl border border-primary/30 px-4 py-1 text-xs font-medium text-text shadow-pop">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                Chat with your AI team
                <ArrowUpRight className="h-3 w-3 text-text-dim" aria-hidden />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
