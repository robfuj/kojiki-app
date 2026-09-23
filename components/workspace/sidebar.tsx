'use client'

import { useLocale } from '@/components/i18n/locale-provider'
import { AvatarCircle } from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Lightbulb,
  Library,
  ListChecks,
  Microscope,
  Scale,
  Settings,
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

interface SidebarCounts {
  work: number
  decisions: number
  learning: number
}

interface SidebarProps {
  projectName: string | null
  projectMeta: string | null
  tab: TabKey
  onTab: (tab: TabKey) => void
  collapsed: boolean
  counts: SidebarCounts
  onOpenSettings: () => void
  onOpenResearch: () => void
}

/**
 * The operating rail: grouped navigation with live counts, collapsible to an
 * icon rail so the content can take the whole width.
 */
export function Sidebar({
  projectName,
  projectMeta,
  tab,
  onTab,
  collapsed,
  counts,
  onOpenSettings,
  onOpenResearch,
}: SidebarProps) {
  const { t } = useLocale()

  const operations: { key: TabKey; label: string; icon: LucideIcon; count?: number }[] = [
    { key: 'overview', label: t.nav.overview, icon: LayoutDashboard },
    { key: 'work', label: t.nav.work, icon: ListChecks, count: counts.work },
    { key: 'decisions', label: t.nav.decisions, icon: Scale, count: counts.decisions },
  ]
  const knowledge: { key: TabKey; label: string; icon: LucideIcon; count?: number }[] = [
    { key: 'departments', label: t.nav.departments, icon: Users },
    { key: 'evidence', label: t.nav.evidence, icon: Library },
    { key: 'learning', label: t.nav.learning, icon: Lightbulb, count: counts.learning },
  ]

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-card/60 transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div className={cn('border-b border-border px-3 py-3.5', collapsed && 'px-2')}>
        <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
          <AvatarCircle name={projectName ?? 'K'} className="size-9 shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {projectName ?? '—'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {projectMeta ?? ''}
              </p>
            </div>
          )}
        </div>

        {/* The research the orchestrator did before decomposing this project
            belongs to the project, so it sits under the project's name rather
            than in the switcher that only chooses between projects. */}
        <button
          type="button"
          onClick={onOpenResearch}
          title={collapsed ? t.research.openButton : undefined}
          className={cn(
            'mt-2.5 flex items-center gap-2 rounded-lg border border-border bg-background/60 text-xs font-medium text-muted-foreground transition-colors hover:border-seal/40 hover:text-foreground',
            collapsed ? 'mx-auto size-8 justify-center p-0' : 'w-full px-2.5 py-1.5',
          )}
        >
          <Microscope className="size-3.5 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{t.research.openButton}</span>}
          {collapsed && <span className="sr-only">{t.research.openButton}</span>}
        </button>
      </div>

      <nav
        aria-label={t.nav.label}
        className="flex-1 space-y-5 overflow-y-auto px-2 pb-4"
      >
        <div>
          {!collapsed && (
            <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {t.nav.operations}
            </p>
          )}
          <ul className="space-y-0.5">
            {operations.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                active={tab === item.key}
                collapsed={collapsed}
                onTab={onTab}
              />
            ))}
          </ul>
        </div>

        <div>
          {!collapsed && (
            <p className="px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {t.nav.knowledge}
            </p>
          )}
          <ul className="space-y-0.5">
            {knowledge.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                active={tab === item.key}
                collapsed={collapsed}
                onTab={onTab}
              />
            ))}
          </ul>
        </div>
      </nav>

      <div className={cn('space-y-0.5 border-t border-border p-2', collapsed && 'px-1.5')}>
        <NavItem
          item={{ key: 'orchestrator', label: t.nav.orchestrator, icon: Waypoints }}
          active={tab === 'orchestrator'}
          collapsed={collapsed}
          onTab={onTab}
        />
        <NavItem
          item={{ key: 'overview', label: t.workspace.settings, icon: Settings }}
          active={false}
          collapsed={collapsed}
          onTab={() => onOpenSettings()}
        />
      </div>
    </aside>
  )
}

function NavItem({
  item,
  active,
  collapsed,
  onTab,
}: {
  item: { key: TabKey; label: string; icon: LucideIcon; count?: number }
  active: boolean
  collapsed: boolean
  onTab: (tab: TabKey) => void
}) {
  const count = item.count ?? 0
  return (
    <li>
      <button
        type="button"
        onClick={() => onTab(item.key)}
        aria-current={active ? 'true' : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          'relative flex w-full items-center gap-2.5 rounded-lg py-2 text-sm transition-colors',
          collapsed ? 'justify-center px-0' : 'px-2.5',
          active
            ? 'bg-primary font-medium text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
        )}
      >
        <item.icon className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
        {!collapsed && count > 0 && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
              active
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-status-review-soft text-status-review',
            )}
          >
            {count}
          </span>
        )}
        {collapsed && count > 0 && (
          <span
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-status-review"
            aria-hidden="true"
          />
        )}
        {collapsed && <span className="sr-only">{item.label}</span>}
      </button>
    </li>
  )
}
