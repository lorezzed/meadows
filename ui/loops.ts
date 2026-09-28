// The diagram's feedback loops as its overlay draws them: one instance per
// R(...)/B(...) annotation, holding every node the annotation mentions, the
// links that join two of them (the loop's drawn boundary), and the ports
// those links hang off. app.ts parks each loop's letter on its boundary,
// and while a letter is hovered (or keyboard-focused) it keeps exactly
// these marks lit and dims the rest.
//
// Pure and dependency-free (type-only imports), like playback.ts, so node
// runs it headlessly (test/loops.mjs).
import type { Link, Node } from "./type";

export type LoopInstance = {
  // The name the compiler generates ("R0", "B1", …) and its letter.
  name: string;
  letter: string;
  // Every node the annotation mentions (a dot, stock, or faucet — the
  // compiler never tags a cloud or a port), in node order.
  members: Node[];
  // Every link between two members, pipes and info arcs alike. A port stands
  // for its parent stock, so the arc from a member stock to a member faucet
  // counts even though it starts on the stock's port.
  edges: Link[];
  // The ports those edges start or end on (ids). A port carries no loop tag,
  // but it is where the loop's arc meets the stock, so it belongs to the
  // loop's drawing.
  ports: Set<string>;
};

// Link endpoints arrive from the compiler as id strings, and d3's link force
// rewrites them to node objects once it has seen them, so read either.
const endId = (end: Link["source"]): string =>
  typeof end === "object" && end !== null ? (end as Node).id : String(end);

// The source-order counter the compiler numbers loops by ("B12" -> 12).
const ordinal = (name: string): number => {
  const n = parseInt(name.slice(1), 10);
  return isNaN(n) ? 0 : n;
};

// Every loop in the graph, in source order (the compiler's numbering). A node
// in several loops is a member of each.
export function loopInstances(nodes: Node[], links: Link[]): LoopInstance[] {
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node]));
  const logical = (id: string): string => {
    const n = byId.get(id);
    return n?.type === "port" && n.parent != null ? n.parent : id;
  };
  const members = new Map<string, Node[]>();
  for (const n of nodes) {
    for (const name of n.loop ?? []) {
      const ms = members.get(name) ?? [];
      ms.push(n);
      members.set(name, ms);
    }
  }
  return [...members.entries()]
    .sort(([a], [b]) => ordinal(a) - ordinal(b))
    .map(([name, ms]) => {
      const ids = new Set(ms.map(m => m.id));
      const edges = links.filter(l =>
        ids.has(logical(endId(l.source))) && ids.has(logical(endId(l.target))));
      const ports = new Set(edges
        .flatMap(l => [endId(l.source), endId(l.target)])
        .filter(id => byId.get(id)?.type === "port"));
      return { name, letter: name.charAt(0), members: ms, edges, ports };
    });
}
