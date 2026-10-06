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
- [ ] Step 2: sidebar agent list (`components/workspace/sidebar.tsx`): small face + name + status text, "N working" heading. Reuse `summariseAgent` + same SWR key.
- [ ] Step 3: Owner column in Work table (`components/workspace/work/okr-cascade.tsx`): `<AgentFace size="sm">` + name; owner via `objective.ownerBotId` → department index for tint (tint index = roster position).
- [ ] Step 4: clicking an agent filters the Work table to that agent (lift an `ownerFilter` state into `workspace-shell.tsx`, then switch tab to Work). Replaces the onChatWithBot click from step 1.
- [ ] Step 5 (optional): remove the old department "bubbles" card on Overview, now duplicated by the orbit.
- [ ] Optional: synapsis "thinking…" chip on a working agent (later moves to background).

## Testing
- Test login: uitest-v0@example.com / uitest-pass-1234; seeded objectives live in project "APAC Freight Expansion".
- Type check: `bash node_modules/.bin/tsc --noEmit -p .` (plain `npx tsc` picks a wrong copy).
