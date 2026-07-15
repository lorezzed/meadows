import type { Node, Link } from "../type";

export const cloudWidth = 40;
export const cloudHeight = 40;

export function cloud(svg: d3.Selection<SVGSVGElement, Node, HTMLElement, Link>) {
    return svg.append<SVGGElement>("g")
        .selectAll<SVGRectElement, Node>("rect");
}

export function cloudTick(node: d3.Selection<SVGRectElement, Node, SVGGElement, Link>) {
    return node
        .attr("x", d => d.x - cloudWidth / 2)
        .attr("y", d => d.y - cloudHeight / 2);
}