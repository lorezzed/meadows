type NodeBase = {
  type: string;
  id: number;
  label: string
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