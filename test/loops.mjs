// Headless checks of the diagram's loop overlay: ui/loops.ts must give each
// R(...)/B(...) annotation exactly its members, the links joining two of them
// (a port standing for its stock), and the ports on those links — the marks a
// hovered loop letter keeps lit and the boundary its letter parks on — for
// graphs compiled by the real backend.
// Run with:   node test/loops.mjs
import * as M from '../output/Main/index.js';
import { loopInstances } from '../ui/loops.ts';
import { exampleList } from '../ui/example.ts';

let failures = 0;
const fail = (label, msg) => { failures++; console.log(`FAIL ${label}: ${msg}`); };

const compile = (src) => {
  const g = JSON.parse(M.go(src));
  if (typeof g === 'string') throw new Error(`compile error: ${g}`);
  return g;
};
const example = (label) => exampleList.find(e => e.label === label).content;
const endId = (e) => (typeof e === 'object' && e !== null ? e.id : String(e));

// The rule itself, over every example: members are exactly the nodes the
// annotation tags, edges exactly the links whose ends (a port read as its
// stock) are both members, ports exactly the port ends of those edges — and
// the loops come in source order, each once.
for (const { label, content } of exampleList) {
  const g = compile(content);
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const logical = (id) => { const n = byId.get(id); return n?.type === 'port' ? n.parent : id; };
  const loops = loopInstances(g.nodes, g.links);
  const names = [...new Set(g.nodes.flatMap(n => n.loop ?? []))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  if (JSON.stringify(loops.map(l => l.name)) !== JSON.stringify(names))
    fail(label, `loops ${JSON.stringify(loops.map(l => l.name))}, want ${JSON.stringify(names)}`);
  for (const loop of loops) {
    const at = `${label} ${loop.name}`;
    if (loop.letter !== loop.name[0] || !'RB'.includes(loop.letter)) fail(at, `letter ${loop.letter}`);
    const want = g.nodes.filter(n => n.loop?.includes(loop.name));
    if (loop.members.length !== want.length || !want.every(n => loop.members.includes(n)))
      fail(at, 'members are not exactly the tagged nodes');
    if (loop.members.some(n => n.type === 'cloud' || n.type === 'port')) fail(at, 'a cloud or port is a member');
    const ids = new Set(want.map(n => n.id));
    const wantEdges = g.links.filter(l => ids.has(logical(endId(l.source))) && ids.has(logical(endId(l.target))));
    if (loop.edges.length !== wantEdges.length || !wantEdges.every(l => loop.edges.includes(l)))
      fail(at, 'edges are not exactly the member-to-member links');
    const wantPorts = new Set(wantEdges.flatMap(l => [endId(l.source), endId(l.target)])
      .filter(id => byId.get(id)?.type === 'port'));
    if (loop.ports.size !== wantPorts.size || ![...wantPorts].every(id => loop.ports.has(id)))
      fail(at, `ports ${JSON.stringify([...loop.ports])}, want ${JSON.stringify([...wantPorts])}`);
    for (const id of loop.ports) {
      if (!ids.has(byId.get(id)?.parent)) fail(at, `port ${id} is not on a member stock`);
    }
  }
}

// The sketches, spelled out: each loop's members and edges by label, an
// edge as type:source>target (flow or arrow) with a port read as its stock.
const describe = (g, loop) => {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const name = (id) => { const n = byId.get(id); return n.type === 'port' ? byId.get(n.parent).label : n.label; };
  return {
    members: loop.members.map(n => n.label).sort(),
    edges: loop.edges.map(l => `${l.type}:${name(endId(l.source))}>${name(endId(l.target))}`).sort(),
    ports: loop.ports.size,
  };
};
const expectLoops = (label, want) => {
  const g = compile(example(label));
  const got = Object.fromEntries(loopInstances(g.nodes, g.links).map(l => [l.name, describe(g, l)]));
  for (const [name, w] of Object.entries(want)) {
    w.edges.sort();
    if (JSON.stringify(got[name]) !== JSON.stringify(w))
      fail(`${label} ${name}`, `got ${JSON.stringify(got[name])}, want ${JSON.stringify(w)}`);
  }
  if (Object.keys(got).length !== Object.keys(want).length)
    fail(label, `loops ${JSON.stringify(Object.keys(got))}`);
};

expectLoops('hunger', {
  B0: { members: ['eating', 'food in stomach', 'hunger'],
        edges: ['flow:eating>food in stomach', 'arrow:food in stomach>hunger', 'arrow:hunger>eating'], ports: 1 },
});
// The balancing loop the chicken & egg notes explain: the stock, its
// outflow's tap, the pipe between them and the arc back — never the cloud
// the crossings drain into.
expectLoops('chicken & egg', {
  R0: { members: ['chickens', 'eggs', 'hatching'],
        edges: ['flow:hatching>chickens', 'arrow:chickens>eggs', 'arrow:eggs>hatching'], ports: 1 },
  B1: { members: ['chickens', 'road crossings'],
        edges: ['flow:chickens>road crossings', 'arrow:chickens>road crossings'], ports: 1 },
});
// A node in two loops belongs to both: the backlog → overtime arrow is an
// edge of each.
expectLoops('burnout', {
  B0: { members: ['backlog', 'finishing tasks', 'overtime'],
        edges: ['flow:backlog>finishing tasks', 'arrow:backlog>overtime', 'arrow:overtime>finishing tasks'], ports: 1 },
  R1: { members: ['backlog', 'fatigue', 'mistakes', 'new tasks', 'overtime'],
        edges: ['flow:new tasks>backlog', 'arrow:backlog>overtime', 'arrow:fatigue>mistakes',
          'arrow:mistakes>new tasks', 'arrow:overtime>fatigue'], ports: 1 },
});
// The fan annotation lights all it mentions, across both bands: both
// stocks, both taps, both pipes, and all three arcs (one port each).
expectLoops('predator & prey', {
  R0: { members: ['rabbit births', 'rabbits'],
        edges: ['flow:rabbit births>rabbits', 'arrow:rabbits>rabbit births'], ports: 1 },
  B1: { members: ['fox births', 'foxes', 'rabbits', 'rabbits eaten'],
        edges: ['flow:fox births>foxes', 'flow:rabbits>rabbits eaten', 'arrow:foxes>rabbits eaten',
          'arrow:rabbits>fox births', 'arrow:rabbits>rabbits eaten'], ports: 3 },
  B2: { members: ['fox deaths', 'foxes'],
        edges: ['flow:foxes>fox deaths', 'arrow:foxes>fox deaths'], ports: 1 },
});
expectLoops('confidence', {
  R0: { members: ['confidence', 'practice', 'skill'],
        edges: ['arrow:confidence>practice', 'arrow:practice>skill', 'arrow:skill>confidence'], ports: 0 },
});

// The app plans on d3-bound links, whose ends the force has rewritten to node
// objects: the same loops come out.
{
  const g = compile(example('predator & prey'));
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const bound = g.links.map(l => ({ ...l, source: byId.get(l.source), target: byId.get(l.target) }));
  const a = loopInstances(g.nodes, g.links), b = loopInstances(g.nodes, bound);
  const shape = (ls) => JSON.stringify(ls.map(l =>
    [l.name, l.members.map(n => n.id), l.edges.map(e => `${endId(e.source)}>${endId(e.target)}`), [...l.ports].sort()]));
  if (shape(a) !== shape(b)) fail('bound links', `${shape(b)}\n  want ${shape(a)}`);
  if (!b.every(l => l.edges.every(e => bound.includes(e)))) fail('bound links', 'edges are not the bound link objects');
}

// No annotation, no loops — however loop-shaped the arrows.
{
  const g = compile('[a] =>f |\na -> f');
  if (loopInstances(g.nodes, g.links).length !== 0) fail('no loops', 'a model without annotations has loops');
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('LOOPS CHECKS PASSED');
