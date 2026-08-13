"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Map,
  PlugZap,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Field, Select } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useLlmSettings, useUpdateLlmSettings, useTestProvider } from "@/lib/hooks";
import { TOURS, resetTour } from "@/lib/tours";
import type { AgentModelInput, ProviderConfigInput } from "@/lib/types";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "GPT models — the default for most work.",
    model: "gpt-4o-mini",
    base_url: "https://api.openai.com/v1",
  },
  {
    id: "gemini",
    label: "Gemini",
    hint: "Google's models, great value and speed.",
    model: "gemini-2.0-flash",
    base_url: "",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "Strong open models, budget friendly.",
    model: "deepseek-chat",
    base_url: "https://api.deepseek.com/v1",
  },
  {
    id: "qwen",
    label: "Qwen",
    hint: "Alibaba's models through DashScope.",
    model: "qwen-plus",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
];

interface ProviderDraft {
  model: string;
  base_url: string;
  api_key: string;
  clear_key: boolean;
  show_key: boolean;
}

const emptyDraft = (): ProviderDraft => ({
  model: "",
  base_url: "",
  api_key: "",
  clear_key: false,
  show_key: false,
});

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useLlmSettings();
  const toast = useToast();
  const save = useUpdateLlmSettings();
  const test = useTestProvider();

  const [defaultProvider, setDefaultProvider] = useState("");
  const [providers, setProviders] = useState<Record<string, ProviderDraft>>({});
  const [agents, setAgents] = useState<Record<string, AgentModelInput>>({});
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    if (!query.data || touched.current) return;
    setDefaultProvider(query.data.default_provider);
    setProviders(
      Object.fromEntries(
        query.data.providers.map((p) => [
          p.provider,
          { ...emptyDraft(), model: p.model, base_url: p.base_url },
        ]),
      ),
    );
    setAgents(
      Object.fromEntries(
        query.data.agents.map((a) => [
          a.kind,
          { provider: a.provider, model: a.model },
        ]),
      ),
    );
    touched.current = false;
    setDirty(false);
  }, [query.data]);

  const markDirty = (fn: () => void) => {
    touched.current = true;
    fn();
    setDirty(true);
  };

  const setProvider = (id: string, patch: Partial<ProviderDraft>) =>
    markDirty(() =>
      setProviders((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? emptyDraft()), ...patch },
      })),
    );

  const setAgent = (kind: string, patch: Partial<AgentModelInput>) =>
    markDirty(() =>
      setAgents((prev) => ({
        ...prev,
        [kind]: { ...(prev[kind] ?? { provider: "", model: "" }), ...patch },
      })),
    );

  const resetAll = () => {
    if (!query.data) return;
    touched.current = false;
    setDefaultProvider(query.data.default_provider);
    setProviders(
      Object.fromEntries(
        query.data.providers.map((p) => [
          p.provider,
          { ...emptyDraft(), model: p.model, base_url: p.base_url },
        ]),
      ),
    );
    setAgents(
      Object.fromEntries(
        query.data.agents.map((a) => [
          a.kind,
          { provider: a.provider, model: a.model },
        ]),
      ),
    );
    setDirty(false);
  };

  const handleSave = async () => {
    const payloadProviders: ProviderConfigInput[] = PROVIDERS.map((p) => {
      const d = providers[p.id] ?? emptyDraft();
      return {
        provider: p.id,
        api_key: d.api_key,
        model: d.model,
        base_url: d.base_url,
        clear_key: d.clear_key,
      };
    });
    const payloadAgents = Object.fromEntries(
      Object.entries(agents).map(([kind, a]) => [
        kind,
        a.provider ? { provider: a.provider, model: a.model } : null,
      ]),
    );
    try {
      await save.mutateAsync({
        default_provider: defaultProvider,
        providers: payloadProviders,
        agents: payloadAgents,
      });
      touched.current = false;
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      toast.push("Settings saved. Agents are using the new models now.", "success");
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Failed to save settings.",
        "error",
      );
    }
  };

  const handleTest = async (id: string) => {
    const d = providers[id] ?? emptyDraft();
    try {
      const res = await test.mutateAsync({
        provider: id,
        api_key: d.api_key || undefined,
        model: d.model || undefined,
        base_url: d.base_url || undefined,
      });
      toast.push(res.detail, res.ok ? "success" : "error");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Connection test failed.", "error");
    }
  };

  const restartTour = (id: string) => {
    const t = TOURS.find((x) => x.id === id);
    if (!t) return;
    resetTour(id);
    window.dispatchEvent(new CustomEvent("devpilot:tour-restart", { detail: id }));
    if (pathname !== t.route) router.push(t.route);
  };

  if (query.isLoading) return <PageLoader label="Loading settings…" />;

  const configured = query.data?.configured;
  const agentRows = query.data?.agents ?? [];
  const testingId = test.isPending ? (test.variables?.provider ?? null) : null;
  const saving = save.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        center
        eyebrow="Connect"
        title="Settings"
        description="Connect an AI provider and tell DevPilot which models each specialist should use. Keys stay on your machine."
      />

      {/* Status strip */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3",
          configured
            ? "border-success/30 bg-success/10 text-success"
            : "border-warning/30 bg-warning/10 text-warning",
        )}
      >
        {configured ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <ShieldAlert className="h-4 w-4 shrink-0" />
        )}
        <p className="text-sm">
          {configured
            ? "An AI provider is connected — you're ready to run builds."
            : "No AI provider is connected yet. Add an API key below to get started."}
        </p>
        {savedAt && !dirty && (
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
            Saved {savedAt}
          </span>
        )}
        {dirty && (
          <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Unsaved changes
          </span>
        )}
      </div>

      {/* Default provider */}
      <Card data-tour="settings-provider">
        <CardHeader>
          <div>
            <CardTitle>Default provider</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Used by any specialist without their own model assignment.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROVIDERS.map((p) => {
              const st = query.data?.providers.find((x) => x.provider === p.id);
              const selected = defaultProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => markDirty(() => setDefaultProvider(p.id))}
                  className={cn(
                    "relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors duration-150",
                    selected
                      ? "border-primary/50 bg-primary-soft"
                      : "border-edge bg-surface-2/50 hover:border-edge hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-text">
                      {p.label}
                    </span>
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
                        selected
                          ? "border-primary bg-primary"
                          : "border-edge bg-surface",
                      )}
                    >
                      {selected && <Check className="h-3 w-3 text-primary-ink" />}
                    </span>
                  </span>
                  <span className="text-[11px] leading-4 text-muted">{p.hint}</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
                      st?.has_key ? "text-success" : "text-faint",
                    )}
                  >
                    {st?.has_key ? "Key connected" : "No key"}
                  </span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Providers */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Providers</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              API keys, models and custom endpoints. Use Test connection to check
              credentials without spending a request.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {PROVIDERS.map((p) => {
            const d = providers[p.id] ?? emptyDraft();
            const st = query.data?.providers.find((x) => x.provider === p.id);
            const busy = testingId === p.id;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-edge bg-surface-2/40 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-semibold text-text">
                    {p.label}
                  </span>
                  {st?.has_key && !d.clear_key && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-success">
                      <KeyRound className="h-3 w-3" /> {st.key_masked}
                    </span>
                  )}
                  {d.clear_key && (
                    <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-danger">
                      Key will be cleared
                    </span>
                  )}
                  {d.api_key && (
                    <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
                      New key staged
                    </span>
                  )}
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
                  <Field label="Model">
                    <Input
                      value={d.model}
                      onChange={(e) => setProvider(p.id, { model: e.target.value })}
                      placeholder={p.model}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="API base URL">
                    <Input
                      value={d.base_url}
                      onChange={(e) => setProvider(p.id, { base_url: e.target.value })}
                      placeholder={p.base_url || "https://api.example.com/v1"}
                      spellCheck={false}
                    />
                  </Field>
                  <Field
                    label="API key"
                    hint={
                      st?.has_key
                        ? "Clear the key and save to remove it."
                        : "Paste your key to connect this provider."
                    }
                  >
                    <div className="relative">
                      <Input
                        type={d.show_key ? "text" : "password"}
                        value={d.api_key}
                        onChange={(e) =>
                          setProvider(p.id, {
                            api_key: e.target.value,
                            clear_key: e.target.value === "",
                          })
                        }
                        placeholder={
                          st?.has_key ? "••••••••••••••••" : "sk-…"
                        }
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => setProvider(p.id, { show_key: !d.show_key })}
                        aria-label={d.show_key ? "Hide key" : "Show key"}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint hover:text-text"
                      >
                        {d.show_key ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </Field>
                  <div className="flex items-end gap-2">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => handleTest(p.id)}
                      loading={busy}
                      disabled={saving}
                      className="whitespace-nowrap"
                    >
                      <PlugZap className="h-4 w-4" /> Test
                    </Button>
                    {st?.has_key && !d.clear_key && (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={() => setProvider(p.id, { clear_key: true, api_key: "" })}
                        disabled={saving}
                        aria-label={`Clear ${p.label} key`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* Agent routing */}
      <Card data-tour="settings-agents">
        <CardHeader>
          <div>
            <CardTitle>Specialist models</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Pick a model for each specialist, or set Inherit to use the
              default provider.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <div className="divide-y divide-edge-soft">
            {agentRows.map((agent) => {
              const a = agents[agent.kind] ?? { provider: "", model: "" };
              return (
                <div
                  key={agent.kind}
                  className="grid items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1.4fr_1fr_1fr]"
                >
                  <div>
                    <p className="font-display text-sm font-medium text-text">
                      {agent.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                      {agent.kind.replace(/_/g, " ")}
                    </p>
                  </div>
                  <Select
                    value={a.provider}
                    onChange={(e) => setAgent(agent.kind, { provider: e.target.value })}
                    aria-label={`Provider for ${agent.name}`}
                  >
                    <option value="">Inherit</option>
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={a.model}
                    onChange={(e) => setAgent(agent.kind, { model: e.target.value })}
                    placeholder={
                      a.provider
                        ? `${PROVIDERS.find((p) => p.id === a.provider)?.model ?? "model"}`
                        : "Provider default"
                    }
                    disabled={!a.provider}
                    spellCheck={false}
                    aria-label={`Model for ${agent.name}`}
                  />
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Guided tours */}
      <Card data-tour="settings-tours">
        <CardHeader>
          <div>
            <CardTitle>Guided tours</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              Replay a tab&apos;s walkthrough anytime. First visits show it
              automatically.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <div className="divide-y divide-edge-soft">
            {TOURS.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface-2 text-text-dim">
                    <Map className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-medium text-text">
                      {t.tab}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {t.description}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => restartTour(t.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restart
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {test.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Validating provider…
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-edge-soft pt-4">
        <Button variant="ghost" onClick={resetAll} disabled={!dirty || saving}>
          <RotateCcw className="h-4 w-4" /> Discard
        </Button>
        <Button data-tour="settings-save" onClick={handleSave} loading={saving} disabled={!dirty}>
          <Check className="h-4 w-4" /> Save changes
        </Button>
      </div>
    </div>
  );
}
