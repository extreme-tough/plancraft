/**
 * Task dependency graph (EM-23, EM-45). An edge task → dependency means "task waits for dependency".
 */

export interface GraphNode {
  id: string;
  dependsOn: readonly string[];
}

/** Returns one loop as a path that starts and ends on the same id ("A → B → A"), or null. */
export function findCycle(nodes: readonly GraphNode[]): string[] | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    const seen = state.get(id);
    if (seen === "done") return null;
    if (seen === "visiting") return [...path.slice(path.indexOf(id)), id];

    state.set(id, "visiting");
    path.push(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dependency)) continue;
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(id, "done");
    return null;
  };

  for (const node of nodes) {
    const cycle = visit(node.id);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Orders tasks so every task comes after everything it depends on (Kahn's algorithm).
 * Ties keep the input order, so the result is deterministic. Throws on a loop.
 */
export function topologicalOrder<T extends GraphNode>(nodes: readonly T[]): T[] {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!indegree.has(dependency)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), node.id]);
    }
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: T[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(byId.get(id) as T);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }
  if (order.length !== nodes.length) throw new RangeError("Dependency graph has a loop");
  return order;
}

/**
 * Every task that (directly or indirectly) depends on `id`. The task editor greys these out when
 * picking `id`'s dependencies, so a loop can't be chosen in the first place (EM-45).
 */
export function dependentsOf(nodes: readonly GraphNode[], id: string): Set<string> {
  const reverse = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      reverse.set(dependency, [...(reverse.get(dependency) ?? []), node.id]);
    }
  }
  const found = new Set<string>();
  const stack = [...(reverse.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(reverse.get(next) ?? []));
  }
  return found;
}

/** Formats a loop for the user, using task titles: "Book venue → Send invitations → Book venue". */
export function describeCycle(cycle: readonly string[], titleOf: (id: string) => string): string {
  return cycle.map(titleOf).join(" → ");
}
