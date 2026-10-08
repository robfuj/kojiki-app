# Agent orbit — continuation notes

Read this first when continuing. Reference: orbit-agent-workspace.vercel.app (Home orbit, sidebar agent list, Owner column).

## Decisions (agreed with user)
- Keep the warm light palette. No dark theme, no images: faces are drawn circles + two eyes, tinted per agent.
- Keep existing wording ("orchestrator", synapsis results). Status is always written as text, not colour alone.
- Statuses: working (blue `status-progress`, soft ping, off under reduced motion), waiting on you (amber `status-review`), idle (grey `status-idle`, dimmed).
- No health columns / "needs you" vs "on track" in Work — AI does the work, so that's redundant.

## Data (no new queries needed)
- Agents = `listDepartmentWork(projectId)` (app/actions/workspace.ts) → `DepartmentWork { botId, displayName, tasks[], pendingGates }`. SWR key `['departments', projectId]` (shared cache with Overview).
- Orchestrator is not a project bot; it's the centre, status derived from its team.
- Task statuses: closed = done/completed/cancelled/failed; waiting = blocked/awaiting_gate/needs_review (or pendingGates > 0); anything else open = working.

## Files
- `components/workspace/agents/agent-status.ts` — `summariseAgent`, `orchestratorStatus`, `AGENT_TINTS`, `STATUS_DOT`.
- `components/workspace/agents/agent-face.tsx` — `<AgentFace status tint size="sm|md|lg" />` (decorative, aria-hidden).
- `components/workspace/agents/agent-orbit.tsx` — Overview card; ring on md+, plain list on mobile.
- Labels: `t.tabs.overview.{agentsTitle, agentsHint, agentsWorkingCount, orchestrator, agentWorking, agentWaiting, agentIdle}` in `lib/i18n/dictionaries/en.ts` + `ja.ts`.

## Progress
- [x] Step 1: orbit on Overview (under the header). Clicking an agent currently calls `onChatWithBot(botId)`.
- [x] Step 2: sidebar agent list — `components/workspace/agents/sidebar-agents.tsx`, rendered at the bottom of the sidebar `<nav>` (props `projectId`, `onSelectAgent` passed from `workspace-shell.tsx`). Hides when the project has no agents. Click opens a chat with that bot (same as orbit; step 4 will change both).
- [x] Step 3: Owner column in Work table (`components/workspace/work/okr-cascade.tsx`): `<AgentFace size="sm" status="idle">` + name. Tint comes from `ownerTint` in `work-tab.tsx` = `AGENT_TINTS[workspace.bots index]`. Caveat: assumes `workspace.bots` order matches the department roster order used by the orbit — verify once a project has agents. Status is fixed to `idle` (no per-bot status in that query); wire real status if wanted.
- [ ] Step 4: clicking an agent filters the Work table to that agent (lift an `ownerFilter` state into `workspace-shell.tsx`, then switch tab to Work). Replaces the onChatWithBot click from step 1.
- [ ] Step 5 (optional): remove the old department "bubbles" card on Overview, now duplicated by the orbit.
- [ ] Optional: synapsis "thinking…" chip on a working agent (later moves to background).

## Future: department mascots (not started)
Reference sheet: `docs/brand/kojiki-mascots.png`. Eventually the drawn faces get replaced by Kojiki mascots — a white rounded spirit with a comma mark, accessory per department:
- Orchestrator: red/coral ribbon horns + scarf (larger, at the centre)
- Engineering: green leaves + small blocks · Strategy: purple ribbon/cape · Finance: gold leaves + coin
- HR / People: pink blossoms · Product: blue swirl + ball · Marketing: lavender leaves
Expression set on the sheet maps to statuses: working = laptop pose, waiting = raised/alert pose, idle = sleeping ("zz") pose.
How to swap: `AgentFace` is the single place faces are drawn — replace its body with `<Image>` per department + status, keep the status dot and the written status text. Tint should then come from department name (palette above) instead of roster position in `AGENT_TINTS`. Needs one mascot asset per department × 3 poses.

## Testing
- Test login: uitest-v0@example.com / uitest-pass-1234; seeded objectives live in project "APAC Freight Expansion".
- Type check: `bash node_modules/.bin/tsc --noEmit -p .` (plain `npx tsc` picks a wrong copy).

## Fix list (queued, not started)

- [ ] **Orientation runs research after the first message in a project space.** Expected: the research-first protocol — clarifying questions, then live research, then follow-up questions generated *from* the research findings (max 3-4, ranked impact x uncertainty), at most one re-research loop, then `refined_goal` + confidence + evidence bundle. Thesis: `docs/orientation-protocol-thesis.md`; canonical spec in the kojiki-ontology repo (vendored under `lib/ontology/`, see `lib/ontology/orientation.ts`). Code to inspect: `lib/orchestrator/clarify.ts`, `lib/orchestrator/re-research.ts`, `lib/orchestrator.ts`. Missing per thesis: phase 3 (research-derived follow-ups) and phase 4 (bounded re-research), plus the trigger timing.
- [ ] **Head dispatching sub-agents fails: "Model 'convaiinnovations/laya-free' is a decision model, not a language model."** Cause: `lib/ai.ts` builds the id list from the Gateway `/v1/models` catalog (~line 70) without filtering by model `type`, then takes the first `-free` id (~line 100). Fix: keep only entries with `type === 'language'` before the `-free` filter (also check `lib/providers.ts` `isCapable` for the OpenRouter path). Model ids rotate — never pin; see memory `ai-gateway-free-tier.md`.
