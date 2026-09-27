/**
 * TOPOLOGICAL BATCHING — turning a department dependency graph into waves that
 * can run in parallel.
 *
 * Upstream dispatches departments one at a time in registry order, which is
 * correct but slow: Marketing and Finance rarely depend on each other, yet each
 * waits for the other. Kahn's algorithm gives the same correctness and exposes
 * the parallelism — everything with no unmet dependency in a wave runs together,
 * and the next wave only starts when the one before it has reported.
 *
 * The important behaviour is what happens on a cycle. A cyclic graph has no valid
 * order, and the tempting failure mode is to drop the offending nodes and
 * dispatch the rest as though nothing was wrong. That silently loses work. Here
 * the cycle is isolated and returned separately: the acyclic part still runs, and
 * the caller is told exactly which departments could not be ordered and why.
 *
 * Pure and dependency-free — no database, no I/O — so it is directly testable.
 */

export interface DeptNode {
  /** Ontology key, e.g. "marketing-brand". */
  specialistKey: string
  /** specialistKeys this node waits for. Unknown keys are ignored. */
  dependencies: string[]
  /** Registry node the work is dispatched to, e.g. "Marketing.Head". */
  registryNode: string
}

export interface TopologicalPlan {
  /** Waves in execution order. Every node in a wave may run concurrently. */
  batches: DeptNode[][]
  /**
   * Nodes that could not be ordered, grouped by the cycle they participate in.
   * Never empty-and-forgotten: a caller that ignores this loses departments.
   */
  isolated: DeptNode[][]
  /** How many dependency edges were honoured (dependencies outside the set are not counted). */
  edges: number
  /** Duplicate specialistKeys that were collapsed. */
  duplicates: string[]
}

/**
 * Orders departments into parallel waves.
 *
 * Dependencies naming a department outside `nodes` are ignored rather than
 * treated as unsatisfiable — a department can depend on one that is not part of
 * this dispatch, and waiting for it forever would deadlock the wave.
 */
export function topologicalBatches(nodes: DeptNode[]): TopologicalPlan {
  const duplicates: string[] = []
  const byKey = new Map<string, DeptNode>()

  for (const node of nodes) {
    if (byKey.has(node.specialistKey)) {
      duplicates.push(node.specialistKey)
      continue
    }
    byKey.set(node.specialistKey, node)
  }

  // Only edges inside the dispatched set constrain ordering.
  const dependencies = new Map<string, Set<string>>()
  const dependents = new Map<string, Set<string>>()
  let edges = 0

  for (const key of byKey.keys()) {
    dependencies.set(key, new Set())
    dependents.set(key, new Set())
  }

  for (const [key, node] of byKey) {
    for (const dependency of node.dependencies) {
      if (dependency === key) continue
      if (!byKey.has(dependency)) continue
      if (dependencies.get(key)!.has(dependency)) continue
      dependencies.get(key)!.add(dependency)
      dependents.get(dependency)!.add(key)
      edges += 1
    }
  }

  const batches: DeptNode[][] = []
  const placed = new Set<string>()
  let ready = [...byKey.keys()].filter((key) => dependencies.get(key)!.size === 0)

  while (ready.length > 0) {
    // Sort within a wave so the plan is deterministic — two runs over the same
    // graph produce the same waves, which matters when a run is replayed.
    ready.sort()
    batches.push(ready.map((key) => byKey.get(key)!))

    for (const key of ready) placed.add(key)

    const next: string[] = []
    for (const key of ready) {
      for (const dependent of dependents.get(key)!) {
        const remaining = dependencies.get(dependent)!
        remaining.delete(key)
        if (remaining.size === 0 && !placed.has(dependent)) next.push(dependent)
      }
    }
    ready = next
  }

  const unplaced = [...byKey.keys()].filter((key) => !placed.has(key))
  const isolated = isolateCycles(unplaced, byKey, dependencies)

  return { batches, isolated, edges, duplicates }
}

/**
 * Groups the unorderable remainder into the cycles they belong to.
 *
 * Connected components over the remaining dependency edges: everything that can
 * reach everything else through unmet dependencies is reported as one group, so
 * the caller sees "Finance and Legal are waiting on each other" rather than two
 * unrelated-looking dropped nodes.
 */
function isolateCycles(
  unplaced: string[],
  byKey: Map<string, DeptNode>,
  dependencies: Map<string, Set<string>>,
): DeptNode[][] {
  if (unplaced.length === 0) return []

  const remaining = new Set(unplaced)
  const neighbours = new Map<string, Set<string>>()
  for (const key of unplaced) {
    const links = new Set<string>()
    for (const dependency of dependencies.get(key)!) {
      if (remaining.has(dependency)) links.add(dependency)
    }
    neighbours.set(key, links)
  }
  // Undirected: a cycle reads the same from either side.
  for (const key of unplaced) {
    for (const neighbour of neighbours.get(key)!) {
      neighbours.get(neighbour)!.add(key)
    }
  }

  const seen = new Set<string>()
  const groups: DeptNode[][] = []

  for (const start of unplaced) {
    if (seen.has(start)) continue
    const group: string[] = []
    const queue = [start]
    seen.add(start)

    while (queue.length > 0) {
      const key = queue.shift()!
      group.push(key)
      for (const neighbour of neighbours.get(key)!) {
        if (seen.has(neighbour)) continue
        seen.add(neighbour)
        queue.push(neighbour)
      }
    }

    group.sort()
    groups.push(group.map((key) => byKey.get(key)!))
  }

  return groups
}

/** A readable explanation of a plan, for logs and for the user-facing surface. */
export function describePlan(plan: TopologicalPlan): string {
  const waves = plan.batches
    .map((batch, index) => `wave ${index + 1}: ${batch.map((node) => node.specialistKey).join(', ')}`)
    .join(' | ')

  const isolated =
    plan.isolated.length > 0
      ? ` — unorderable (dependency cycle): ${plan.isolated
          .map((group) => group.map((node) => node.specialistKey).join(' <-> '))
          .join('; ')}`
      : ''

  return `${waves || 'no dispatchable departments'}${isolated}`
}
