import type { Node, Link } from "../type";

const dotRadius = 20;

export function dot(svg: d3.Selection<SVGSVGElement, Node, HTMLElement, Link>) {
  return svg.append<SVGGElement>("g")
    .attr("r", 8)
    .attr("fill", "rgba(0, 0, 255, 0.5)")
    // .attr("fill", "steelblue")
    .attr("stroke", "#00f")
    .attr("stroke-width", 1.5)
    .selectAll<SVGCircleElement, Node>("circle");
}

export function dotTick(nodeDot: d3.Selection<SVGCircleElement, Node, SVGGElement, Link>) {
  return nodeDot
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", dotRadius);
}