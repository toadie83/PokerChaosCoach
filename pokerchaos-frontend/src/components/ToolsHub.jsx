import {
  CAPABILITY_KEYS,
  canAccessCapability,
  getCapabilityState,
  getCapabilityStatusLabel,
} from "../lib/capabilities.js";

const TOOL_DEFINITIONS = [
  {
    key: CAPABILITY_KEYS.STUDY_SPOTS,
    title: "Find My Study Spots",
    description:
      "Upload a tournament and find the decisions most worth studying.",
    path: "/tools/study-spots",
  },
  {
    key: CAPABILITY_KEYS.TOURNAMENT_REVIEW,
    title: "Tournament Review",
    description:
      "Detailed analysis of decisions, mistakes, leaks and opportunities.",
    path: "/tools/tournament-review",
  },
  {
    key: CAPABILITY_KEYS.COACH,
    title: "Poker Coach",
    description: "Personalised ongoing analysis and study guidance.",
    path: "/tools/coach",
  },
];

function getActionLabel(entitlements, tool) {
  const state = getCapabilityState(entitlements, tool.key);
  if (tool.key === CAPABILITY_KEYS.STUDY_SPOTS) return "Start";
  if (tool.key === CAPABILITY_KEYS.COACH) {
    return state === "active" ? "Open" : "";
  }
  if (state === "active") return "Open";
  if (state === "trial") return "Continue trial";
  return "View access";
}

export default function ToolsHub({ entitlements, navigate }) {
  return (
    <main className="tools-page">
      <header className="tools-page-header">
        <p className="tools-page-kicker">Playback Poker Tools</p>
        <h1>What do you want to work on?</h1>
      </header>

      <section className="tools-grid" aria-label="Poker study tools">
        {TOOL_DEFINITIONS.map((tool) => {
          const actionLabel = getActionLabel(entitlements, tool);
          const capabilityState = getCapabilityState(entitlements, tool.key);
          const canAccess = canAccessCapability(entitlements, tool.key);
          const isCoach = tool.key === CAPABILITY_KEYS.COACH;
          return (
            <article
              className="tool-card"
              data-capability={tool.key}
              data-state={capabilityState}
              key={tool.key}
            >
              <div className="tool-card-heading">
                <h2>{tool.title}</h2>
                <span className="tool-card-status">
                  {getCapabilityStatusLabel(entitlements, tool.key)}
                </span>
              </div>
              <p>{tool.description}</p>
              {actionLabel ? (
                <button
                  type="button"
                  className={canAccess ? "tool-card-action" : "tool-card-action secondary"}
                  onClick={() => navigate(tool.path)}
                >
                  {actionLabel}
                </button>
              ) : (
                <span className="tool-card-unavailable" aria-label="Unavailable">
                  {isCoach ? "Coming later" : "Unavailable"}
                </span>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
