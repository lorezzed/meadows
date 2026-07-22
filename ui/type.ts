// A compiled formula from the JSON seam: numbers, node references (by id),
// and binary arithmetic — the evaluator resolved names to ids and drew the
// implied info arrows; the simulator evaluates the tree each step.
export type Expr =
  | { kind: "num"; value: number }
  | { kind: "ref"; id: string }
  | { kind: "+" | "-" | "*" | "/"; left: Expr; right: Expr };

type NodeBase = {
  type: string;
  id: string;
  label: string;
  // Band group assigned by the compiler (absent/null = floats). Numbered top to
  // bottom across the diagram.
  group?: number | null;
  // Loop membership assigned by the compiler: the unique names ("R0", "B1", …
  // numbered by source order) of every R(...)/B(...) annotation this node
  // appears in. Absent/null = in no loop.
  loop?: string[] | null;
  // Numeric annotation from the DSL (absent/null = none): a stock's initial
  // level (`[name: N]`) or a faucet's initial rate (`=>name: N`).
  value?: number | null;
  // A schedule's steps (`=>name: 0 @5: 5` = rate 0, then 5 from t=5; dots
  // take them too as driving variables). Absent/null = `value` throughout.
  steps?: { at: number; value: number }[] | null;
  // True when the steps were written with `~`: the schedule interpolates a
  // smooth monotone curve through its points instead of holding
  // piecewise-constant. Absent/null = stepped.
  smooth?: boolean | null;
  // A `: (expr)` formula: a computed auxiliary (dots) or a rate law
  // (faucets). Mutually exclusive with value/steps (first annotation wins).
  expr?: Expr | null;
  // A port's owning stock id (type "port" only): the boundary dot the
  // compiler mints where an info arrow meets a stock. Absent elsewhere.
  parent?: string | null;
  // Layout hints derived from `group` each update(): whether this node sits on a
  // flow band (a horizontal line) and, if so, that band's target y. Stocks also
  // get a target x slot (evenly spaced within their band) that anchors them;
  // clouds target their band's outer edge (sources left, sinks right).
  inFlow?: boolean;
  gy?: number;
  gx?: number;
  // Port hints stamped each update() (type "port" only): the parent stock's
  // node object (the port pins just inside its rect each tick) and the far
  // endpoint of the port's one arrow (which side of the stock to face) —
  // itself resolved to a parent stock when the far end is another port.
  portParent?: Node;
  portFar?: Node;
  // A hand-dragged port's bearing on its stock's boundary (radians from the
  // stock's center), recorded by the port drag. Sticks across ticks and
  // updates, overriding the automatic face-the-far-endpoint bearing.
  portAngle?: number;
}
type LinkBase = {
  type: string // "arrow"
  // Bow side of the info arc (SVG sweep flag), re-chosen each frame in
  // ticked(): the side whose bulge apex has more clearance from uninvolved
  // nodes wins, with hysteresis so near-ties don't flicker.
  sweep?: 0 | 1;
  // Set on a branch-connector flow pipe (a stock exchanging with a faucet on a
  // row below its band): drawn as an elbow instead of a straight line — down
  // then right for an extra outflow, right then up into the stock's bottom for
  // an extra inflow.
  elbow?: boolean;
}
export type Node = d3.SimulationNodeDatum & NodeBase
export type Link = d3.SimulationLinkDatum<Node> & LinkBase
export type System = {
  nodes: Node[];
  links: Link[];
}