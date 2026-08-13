export interface TourStep {
  selector: string;
  title: string;
  description: string;
  placement?: "top" | "bottom";
}

export interface Tour {
  id: string;
  route: string;
  tab: string;
  description: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: "home",
    route: "/",
    tab: "Home",
    description: "Your AI studio overview and where everything starts.",
    steps: [
      {
        selector: '[data-tour="hero-cta-run"]',
        title: "Start a run",
        description:
          "Launch a work order here. DevPilot's specialists plan, build, review, and ship it for you.",
      },
      {
        selector: '[data-tour="hero-cta-projects"]',
        title: "Browse projects",
        description: "See the workspaces your AI team manages, all in one place.",
      },
      {
        selector: '[data-tour="hero-stats"]',
        title: "Team at a glance",
        description:
          "How many specialists are online and what the team is currently working on.",
      },
    ],
  },
  {
    id: "agents",
    route: "/agents",
    tab: "Agents",
    description: "Meet the five specialists on your AI team.",
    steps: [
      {
        selector: '[data-tour="agent-card"]',
        title: "Specialist roster",
        description:
          "Five AI employees, each with a focused role. Tap a card to select it.",
      },
      {
        selector: '[data-tour="agent-status"]',
        title: "Live status",
        description:
          "See whether each agent is idle, working, or needs attention.",
      },
      {
        selector: '[data-tour="agent-memory"]',
        title: "Agent memory",
        description:
          "Open an agent's long-term memory to review what it has learned.",
      },
    ],
  },
  {
    id: "projects",
    route: "/projects",
    tab: "Projects",
    description: "Workspaces DevPilot builds inside.",
    steps: [
      {
        selector: '[data-tour="new-project"]',
        title: "Create a project",
        description:
          "Add a workspace folder and let DevPilot work inside it.",
      },
      {
        selector: '[data-tour="project-card"]',
        title: "Project card",
        description:
          "Open a project to browse files, dispatch the crew, and manage deployments.",
      },
      {
        selector: '[data-tour="project-actions"]',
        title: "Project actions",
        description:
          "Deploy, open the live site, or remove a project from the ⋮ menu.",
      },
    ],
  },
  {
    id: "workflows",
    route: "/workflows",
    tab: "Workflows",
    description: "Mission control for dispatching the crew.",
    steps: [
      {
        selector: '[data-tour="dispatch-desk"]',
        title: "Dispatch desk",
        description:
          "Mission control: pick agents, write the brief, and launch a work order.",
      },
      {
        selector: '[data-tour="crew-sequence"]',
        title: "Crew sequence",
        description:
          "Choose which specialists run and in what order they work.",
      },
      {
        selector: '[data-tour="dispatch-button"]',
        title: "Dispatch",
        description:
          "Fire off the run and watch your crew work live.",
      },
      {
        selector: '[data-tour="ledger"]',
        title: "The ledger",
        description:
          "Every work order lands here so you can review progress and results.",
      },
    ],
  },
  {
    id: "activity",
    route: "/activity",
    tab: "Activity",
    description: "An immutable audit trail of every action.",
    steps: [
      {
        selector: '[data-tour="activity-filters"]',
        title: "Filter events",
        description:
          "Narrow the trail by type — creates, approvals, tool calls, and more.",
      },
      {
        selector: '[data-tour="activity-feed"]',
        title: "Audit trail",
        description:
          "Every action by an agent or human, recorded immutably.",
      },
    ],
  },
  {
    id: "chat",
    route: "/chat",
    tab: "Chat",
    description: "Talk to your AI team in plain language.",
    steps: [
      {
        selector: '[data-tour="chat-scope"]',
        title: "Scope to a project",
        description:
          "Optionally pin the conversation to a project so agents work in that context.",
      },
      {
        selector: '[data-tour="chat-input"]',
        title: "Ask the team",
        description:
          "Describe what you need — DevPilot routes it to the right specialist automatically.",
      },
      {
        selector: '[data-tour="chat-send"]',
        title: "Send",
        description:
          "Fire your question and watch the routed agent answer.",
      },
    ],
  },
  {
    id: "settings",
    route: "/settings",
    tab: "Settings",
    description: "Connect providers and tune each specialist.",
    steps: [
      {
        selector: '[data-tour="settings-provider"]',
        title: "Default provider",
        description:
          "Pick which AI provider the whole team uses by default.",
      },
      {
        selector: '[data-tour="settings-agents"]',
        title: "Specialist models",
        description:
          "Assign a specific model to each specialist, or let them inherit the default.",
      },
      {
        selector: '[data-tour="settings-save"]',
        title: "Save changes",
        description:
          "Apply your configuration — the team picks it up immediately.",
      },
      {
        selector: '[data-tour="settings-tours"]',
        title: "Guided tours",
        description:
          "Replay any tab's tour anytime from this panel.",
      },
    ],
  },
];

const STORAGE_KEY = "devpilot:tours";

export function getCompletedTours(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isTourComplete(id: string): boolean {
  return getCompletedTours()[id] === true;
}

export function markTourComplete(id: string): void {
  const next = { ...getCompletedTours(), [id]: true };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function resetTour(id: string): void {
  const next = { ...getCompletedTours() };
  delete next[id];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function tourForPath(path: string): Tour | null {
  return TOURS.find((t) => t.route === path) ?? null;
}
