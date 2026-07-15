import type { Node, Link } from "../type";

export const faucetWidth = 40;
export const faucetHeight = 40;

export function faucet(svg: d3.Selection<SVGSVGElement, Node, HTMLElement, Link>) {
    return svg.append<SVGGElement>("g")
        .selectAll<SVGRectElement, Node>("rect");
}

export function faucetTick(node: d3.Selection<SVGRectElement, Node, SVGGElement, Link>) {
    return node
        .attr("x", d => d.x - faucetWidth / 2)
        .attr("y", d => d.y - faucetHeight / 2);
}