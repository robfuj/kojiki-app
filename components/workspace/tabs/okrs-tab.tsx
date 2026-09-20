'use client'

import type { BotRow } from '@/app/actions/projects'
import { OkrTree } from '@/components/workspace/okr-tree'
import { SubGoalPanel } from '@/components/workspace/sub-goal-panel'

/**
 * The OKRs tab: the tree of objectives, and the execution panel for whichever
 * sub-goal is open. The drill state lives in the shell so other tabs — the Home
 * cards, an orchestrator "open objective" action — can deep-link into a node.
 */

interface OkrsTabProps {
  projectId: string
  projectName: string
  bots: BotRow[]
  openSubGoalId: string | null
  onOpenSubGoal: (objectiveId: string) => void
  onBack: () => void
  onTalkToSubAgent: (input: {
    botId: string
    parentSpecialistKey: string
    subAgentKey: string
    subAgentTitle: string
    objectiveId: string
  }) => void
}

export function OkrsTab({
  projectId,
  projectName,
  bots,
  openSubGoalId,
  onOpenSubGoal,
  onBack,
  onTalkToSubAgent,
}: OkrsTabProps) {
  if (openSubGoalId) {
    return (
      <SubGoalPanel
        key={openSubGoalId}
        objectiveId={openSubGoalId}
        bots={bots}
        onBack={onBack}
        onTalkToSubAgent={onTalkToSubAgent}
      />
    )
  }

  return (
    <OkrTree
      projectId={projectId}
      projectName={projectName}
      bots={bots}
      onOpenSubGoal={onOpenSubGoal}
    />
  )
}
