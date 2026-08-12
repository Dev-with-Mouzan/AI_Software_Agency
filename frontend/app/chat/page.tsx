"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Send, Sparkles, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useChat, useProjects } from "@/lib/hooks";
import type { ChatResponse } from "@/lib/types";
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

export default function ChatPage() {
  const projects = useProjects();
  const chat = useChat();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "agent",
      agent_kind: "routing",
      agent: "DevPilot router",
      content:
        "I route your message to the right agent automatically. What would you like to delegate? You can scope it to a project below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const idRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
              content: response.reply,
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
              content: `⚠ ${(error as Error).message}`,
            },
          ]);
        },
      },
    );
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-4xl flex-col">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-primary/30 bg-primary-soft text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold tracking-tight text-text">
                Chat
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                Auto-routed to the right specialist
              </p>
            </div>
          </div>
          <div className="ml-auto w-full sm:w-56">
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Scope to project"
            >
              <option value="">No project context</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-5 py-5">
          <AnimatePresence initial={false}>
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
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border ${
                    isUser
                      ? "border-edge bg-surface-2 text-muted"
                      : "border-primary/30 bg-primary-soft text-primary"
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[75%] rounded-lg border px-4 py-3 ${
                    isUser
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
                          className="rounded-[3px] border border-edge bg-surface px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-text-dim"
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
          </AnimatePresence>
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

        <form
          onSubmit={send}
          className="border-t border-edge-soft bg-surface-2/60 p-4"
        >
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something… e.g. Plan the customer portal, or add auth to the API"
              className="flex-1"
            />
            <Button
              type="submit"
              loading={chat.isPending}
              disabled={!input.trim()}
              size="lg"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
