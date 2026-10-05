'use client'

import type { OkrNode } from '@/app/actions/okr'
import { toneForStatus } from '@/components/workspace/ui/primitives'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

const DOT_TONE: Record<string, string> = {
  progress: 'bg-status-progress',
  review: 'bg-status-review',
  approved: 'bg-status-approved',
  idle: 'bg-status-idle',
}

interface OkrOutlineProps {
  nodes: OkrNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  label: string
}

interface VisibleNode {
  node: OkrNode
  depth: number
  parentId: string | null
}

function pathTo(nodes: OkrNode[], id: string | null, trail: string[] = []): string[] | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return trail
    const found = pathTo(node.children, id, [...trail, node.id])
    if (found) return found
  }
  return null
}

/**
 * The OKR tree as a foldable outline. Only the branch leading to the selected
 * item starts open, so the list stays short; it follows the WAI-ARIA tree pattern
 * for keyboard use.
 */
export function OkrOutline({ nodes, selectedId, onSelect, label }: OkrOutlineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const open = new Set(pathTo(nodes, selectedId) ?? [])
    for (const root of nodes) open.add(root.id)
    return open
  })
  const [focusedId, setFocusedId] = useState<string | null>(selectedId)
  const [revealedFor, setRevealedFor] = useState(selectedId)

  // A selection made elsewhere (e.g. from the orchestrator) must unfold its branch.
  if (revealedFor !== selectedId) {
    setRevealedFor(selectedId)
    const path = pathTo(nodes, selectedId) ?? []
    if (path.some((id) => !expanded.has(id))) {
      setExpanded((prev) => new Set([...prev, ...path]))
    }
  }
  const treeRef = useRef<HTMLUListElement>(null)

  const visible = useMemo(() => {
    const out: VisibleNode[] = []
    const walk = (list: OkrNode[], depth: number, parentId: string | null) => {
      for (const node of list) {
        out.push({ node, depth, parentId })
        if (node.children.length > 0 && expanded.has(node.id)) {
          walk(node.children, depth + 1, node.id)
        }
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
      const shouldOpen = open ?? !next.has(id)
      if (shouldOpen) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function focus(id: string) {
    setFocusedId(id)
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
      ?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
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
        else if (hasChildren && visible[index + 1]) focus(visible[index + 1].node.id)
        break
      case 'ArrowLeft':
        if (hasChildren && isOpen) toggle(current.node.id, false)
        else if (current.parentId) focus(current.parentId)
        break
      case 'Home':
        if (visible[0]) focus(visible[0].node.id)
        break
      case 'End':
        if (visible.length) focus(visible[visible.length - 1].node.id)
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
    <ul ref={treeRef} role="tree" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-1">
      {visible.map(({ node, depth }) => {
        const active = node.id === selectedId
        const hasChildren = node.children.length > 0
        const isOpen = expanded.has(node.id)
        return (
          <li
            key={node.id}
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={active}
            aria-expanded={hasChildren ? isOpen : undefined}
            className="relative"
          >
            {Array.from({ length: depth }, (_, level) => (
              <span
                key={level}
                className="absolute inset-y-0 w-px bg-border"
                style={{ left: `${level * 20 + 22}px` }}
                aria-hidden="true"
              />
            ))}
            <div
              className={cn(
                'relative flex min-h-11 items-center rounded-lg border-l-4 transition-colors',
                active
                  ? 'border-seal bg-seal-soft text-foreground'
                  : 'border-transparent text-foreground hover:bg-muted/60',
              )}
              style={{ paddingLeft: `${depth * 20}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => toggle(node.id)}
                  aria-label={isOpen ? `Fold ${node.title}` : `Unfold ${node.title}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    className={cn('size-5 transition-transform', isOpen && 'rotate-90')}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <span className="w-11 shrink-0" aria-hidden="true" />
              )}
              <button
                type="button"
                data-node-id={node.id}
                tabIndex={node.id === activeFocus ? 0 : -1}
                onFocus={() => setFocusedId(node.id)}
                onClick={() => onSelect(node.id)}
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 py-2 pr-3 text-left"
              >
                {depth === 0 && (
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Company objective
                  </span>
                )}
                <span className={cn('text-pretty text-base leading-snug', active && 'font-semibold')}>
                  {node.title}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={cn('size-2.5 shrink-0 rounded-full', DOT_TONE[toneForStatus(node.status)])}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{node.status.replace(/_/g, ' ')}, </span>
                  <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-seal"
                      style={{ width: `${Math.max(0, Math.min(100, node.progress))}%` }}
                    />
                  </span>
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    {node.progress}%
                  </span>
                </span>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
