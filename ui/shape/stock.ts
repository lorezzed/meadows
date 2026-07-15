import type { Node, Link } from "../type";

export const stockWidth = 40;
export const stockHeight = 40;

export function stock(svg: d3.Selection<SVGSVGElement, Node, HTMLElement, Link>) {
  return svg.append<SVGGElement>("g")
    // .attr("stroke", "#f00")
    // .attr("stroke-width", 1.5)
    // .attr("fill", "rgba(255, 0, 0, 0.5)")
    // .attr("width", stockWidth)
    // .attr("height", stockHeight)
    .selectAll<SVGRectElement, Node>("rect");
}

export function stockTick(nodeStock: d3.Selection<SVGRectElement, Node, SVGGElement, Link>) {
  return nodeStock
    .attr("x", d => d.x - stockWidth / 2)
    .attr("y", d => d.y - stockHeight / 2);
}