'use client'

import type { OkrNode } from '@/app/actions/okr'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

interface OkrCascadeProps {
  nodes: OkrNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  ownerName: (botId: string | null) => string
  labels: { objective: string; owner: string; progress: string; timeframe: string }
  label: string
}

interface VisibleRow {
  node: OkrNode
  depth: number
  parentId: string | null
}

const GRID =
  'grid grid-cols-[minmax(0,1fr)_8rem] @2xl:grid-cols-[minmax(0,1fr)_8rem_7rem] @4xl:grid-cols-[minmax(0,1fr)_10rem_9rem_7rem] items-center gap-4'

export function pathTo(nodes: OkrNode[], id: string | null, trail: OkrNode[] = []): OkrNode[] | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return [...trail, node]
    const found = pathTo(node.children, id, [...trail, node])
    if (found) return found
  }
  return null
}

/**
 * The whole OKR tree as one full-width table. The top two levels start open;
 * deeper levels fold. Follows the WAI-ARIA treegrid keyboard pattern.
 */
export function OkrCascade({ nodes, selectedId, onSelect, ownerName, labels, label }: OkrCascadeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const open = new Set<string>()
    for (const root of nodes) {
      open.add(root.id)
      for (const child of root.children) open.add(child.id)
    }
    for (const node of pathTo(nodes, selectedId) ?? []) open.add(node.id)
    return open
  })
  const [focusedId, setFocusedId] = useState<string | null>(selectedId)
  const [revealedFor, setRevealedFor] = useState(selectedId)
  const tableRef = useRef<HTMLDivElement>(null)

  // A selection made elsewhere (e.g. from the orchestrator) must unfold its branch.
  if (revealedFor !== selectedId) {
    setRevealedFor(selectedId)
    const ancestors = (pathTo(nodes, selectedId) ?? []).slice(0, -1).map((n) => n.id)
    if (ancestors.some((id) => !expanded.has(id))) {
      setExpanded((prev) => new Set([...prev, ...ancestors]))
    }
  }

  const visible = useMemo(() => {
    const out: VisibleRow[] = []
    const walk = (list: OkrNode[], depth: number, parentId: string | null) => {
      for (const node of list) {
        out.push({ node, depth, parentId })
        if (node.children.length > 0 && expanded.has(node.id)) walk(node.children, depth + 1, node.id)
      }
    }
    walk(nodes, 0, null)
    return out
  }, [nodes, expanded])

  const activeFocus = visible.some((v) => v.node.id === focusedId)
    ? focusedId
    : (selectedId ?? visible[0]?.node.id ?? null)

  function toggle(id: string, open?: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (open ?? !next.has(id)) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function focus(id: string) {
    setFocusedId(id)
    tableRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = visible.findIndex((v) => v.node.id === activeFocus)
    const current = visible[index]
    if (!current) return
    const hasChildren = current.node.children.length > 0
    const isOpen = expanded.has(current.node.id)
    switch (event.key) {
      case 'ArrowDown':
        if (visible[index + 1]) focus(visible[index + 1].node.id)
        break
      case 'ArrowUp':
        if (visible[index - 1]) focus(visible[index - 1].node.id)
        break
      case 'ArrowRight':
        if (hasChildren && !isOpen) toggle(current.node.id, true)
        break
      case 'ArrowLeft':
        if (hasChildren && isOpen) toggle(current.node.id, false)
        else if (current.parentId) focus(current.parentId)
        break
      case 'Enter':
      case ' ':
        onSelect(current.node.id)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div
      ref={tableRef}
      role="treegrid"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="@container overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div
        role="row"
        className={cn(GRID, 'border-b border-border px-5 py-3 text-sm font-medium text-muted-foreground')}
      >
        <span role="columnheader">{labels.objective}</span>
        <span role="columnheader" className="hidden @4xl:block">{labels.owner}</span>
        <span role="columnheader">{labels.progress}</span>
        <span role="columnheader" className="hidden @2xl:block">{labels.timeframe}</span>
      </div>

      {visible.map(({ node, depth }) => {
        const active = node.id === selectedId
        const hasChildren = node.children.length > 0
        const isOpen = expanded.has(node.id)
        const progress = Math.max(0, Math.min(100, node.progress))
        return (
          <div
            key={node.id}
            role="row"
            aria-level={depth + 1}
            aria-selected={active}
            aria-expanded={hasChildren ? isOpen : undefined}
            className={cn(
              GRID,
              'min-h-14 border-b border-border px-5 last:border-b-0 transition-colors',
              active ? 'bg-seal-soft' : 'hover:bg-muted/50',
            )}
          >
            <div role="gridcell" className="flex min-w-0 items-center gap-1" style={{ paddingLeft: `${depth * 24}px` }}>
              {hasChildren ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => toggle(node.id)}
                  aria-label={isOpen ? `Fold ${node.title}` : `Unfold ${node.title}`}
                  className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className={cn('size-5 transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                </button>
              ) : (
                <span className="-ml-2 w-10 shrink-0" aria-hidden="true" />
              )}
              <button
                type="button"
                data-node-id={node.id}
                tabIndex={node.id === activeFocus ? 0 : -1}
                onFocus={() => setFocusedId(node.id)}
                onClick={() => onSelect(node.id)}
                className={cn(
                  'min-w-0 flex-1 truncate py-3 text-left text-base text-foreground hover:underline focus-visible:underline',
                  depth === 0 ? 'font-semibold' : active && 'font-medium',
                )}
              >
                {node.title}
              </button>
            </div>
            <span role="gridcell" className="hidden truncate text-sm text-muted-foreground @4xl:block">
              {ownerName(node.ownerBotId)}
            </span>
            <span role="gridcell" className="flex items-center gap-2.5">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-seal" style={{ width: `${progress}%` }} />
              </span>
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{node.progress}%</span>
            </span>
            <span role="gridcell" className="hidden text-sm text-muted-foreground @2xl:block">
              {node.timeframe ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
