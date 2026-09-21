'use client'

import { useLocale } from '@/components/i18n/locale-provider'
import { AvatarCircle, Eyebrow } from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Lightbulb,
  Library,
  ListChecks,
  Scale,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'

export type TabKey =
  | 'overview'
  | 'work'
  | 'decisions'
  | 'departments'
  | 'evidence'
  | 'learning'
  | 'orchestrator'

interface SidebarProps {
  projectName: string | null
  projectMeta: string | null
  tab: TabKey
  onTab: (tab: TabKey) => void
}

/**
 * The workspace rail: the project card, the four operating views, and the two
 * knowledge views. The orchestrator sits apart at the bottom because opening it
 * leaves the rail behind entirely.
 */
export function Sidebar({ projectName, projectMeta, tab, onTab }: SidebarProps) {
  const { t } = useLocale()

  const primary: { key: TabKey; label: string; icon: LucideIcon }[] = [
    { key: 'overview', label: t.nav.overview, icon: LayoutDashboard },
    { key: 'work', label: t.nav.work, icon: ListChecks },
    { key: 'decisions', label: t.nav.decisions, icon: Scale },
    { key: 'departments', label: t.nav.departments, icon: Users },
  ]
  const knowledge: { key: TabKey; label: string; icon: LucideIcon }[] = [
    { key: 'evidence', label: t.nav.evidence, icon: Library },
    { key: 'learning', label: t.nav.learning, icon: Lightbulb },
  ]

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <AvatarCircle name={projectName ?? 'K'} className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {projectName ?? '—'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {projectMeta ?? ''}
          </p>
        </div>
      </div>

      <nav aria-label={t.nav.label} className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-4">
        <ul className="space-y-0.5">
          {primary.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              active={tab === item.key}
              onTab={onTab}
            />
          ))}
        </ul>

        <div>
          <Eyebrow className="px-2 pb-1.5">{t.nav.knowledge}</Eyebrow>
          <ul className="space-y-0.5">
            {knowledge.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                active={tab === item.key}
                onTab={onTab}
              />
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t border-border p-2.5">
        <button
          type="button"
          onClick={() => onTab('orchestrator')}
          aria-current={tab === 'orchestrator' ? 'true' : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
            tab === 'orchestrator'
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <Waypoints className="size-4" aria-hidden="true" />
          {t.nav.orchestrator}
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  item,
  active,
  onTab,
}: {
  item: { key: TabKey; label: string; icon: LucideIcon }
  active: boolean
  onTab: (tab: TabKey) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onTab(item.key)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
          active
            ? 'bg-muted font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        <item.icon className="size-4" aria-hidden="true" />
        {item.label}
      </button>
    </li>
  )
}
