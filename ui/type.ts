type NodeBase = {
  type: string;
  id: string;
  label: string;
  // Band group assigned by the compiler (absent/null = floats). Numbered top to
  // bottom across the diagram.
  group?: number | null;
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
}
export type Node = d3.SimulationNodeDatum & NodeBase
export type Link = d3.SimulationLinkDatum<Node> & LinkBase
export type System = {
  nodes: Node[];
  links: Link[];
}