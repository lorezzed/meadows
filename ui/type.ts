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
  // Layout hints derived from `group` each update(): whether this node sits on a
  // flow band (a horizontal line) and, if so, that band's target y. Stocks also
  // get a target x slot (evenly spaced within their band) that anchors them;
  // clouds target their band's outer edge (sources left, sinks right).
  inFlow?: boolean;
  gy?: number;
  gx?: number;
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