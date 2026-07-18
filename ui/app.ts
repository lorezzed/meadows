import * as d3 from "d3";

import * as interpreter from '../output/Main/index'
import type { Node, Link, System } from "./type";
import faucetSvg from './shape/faucet.svg'
import cloudSvg from './shape/cloud.svg'

const container = d3.select('body')
  .append('div')
  .attr('class', 'container')
  .style('display', 'flex')
  .style('flex-direction', 'column')
const pre = container
  .append('pre')
  .attr('class', 'pre-output')
  .style('order', 9) // flexbox ordering
  .style('min-height', '2em')
  .style('border', '1px solid black')
  .style('white-space', 'pre-wrap')
  .style('word-wrap', 'break-word')
const examples = container
  .append('div')
  .style('order', 2) // flexbox ordering
examples.append('button')
  .text('a->b')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b=>c d')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('[a]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b->[c]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b=>c [d]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('|a->b=>c [d]=>e|')
  .on('click', function () {
    loadExample(this.textContent);
  });


const svgWidth = 600
const svgHeight = 400

const svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> = container
  .append('svg')
  .attr('class', 'svg')
  .style('order', 1) // flexbox ordering
  .style('width', svgWidth)
  .style('height', svgHeight)
  // .attr("viewBox", [-width / 2, -height / 2, width, height])
  .style('border', '1px solid black')
  .on("click", click)
const textInput = container
  .append('textarea')
  .attr('class', 'text-input')
  .style('order', 2) // flexbox ordering
  .style('width', '80em')
  .style('height', '10em')
  .on('input', function (e: Event) {
    try {
      if (!(e.target instanceof HTMLTextAreaElement)) {
        throw new Error("Event target is not a HTMLTextAreaElement");
      }
      const input = e.target.value;
      const output = interpreter.go(input);
      const parse = JSON.parse(output) as System
      console.log('parse::', parse)

      const pretty = JSON.stringify(parse, null, 2)
      pre.text(pretty);
      update(parse)
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error occurred while processing input:", error.message, error);
        console.error(error);
        return
      }
      console.error("An unknown error occurred:", error);
    }
  })

//
let link = svg.append("g")
  .attr("stroke", "#00f")
  .attr("stroke-opacity", 0.6)
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");

const dotRadius = 20;
const stockWidth = 40;
const stockHeight = 40;
const faucetWidth = 40;
const faucetHeight = 40
const cloudWidth = 40;
const cloudHeight = 40;

// Each node is a <g> that holds its shape *and* its text label, so the two
// move together (positioned via a transform in ticked()).
let nodeDot = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeStock = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeFaucet = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeCloud = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");

const systemNodes: Node[] = [];
const systemLinks: Link[] = []
// const nodes: Node[] = [{ type: "dot", id: 1, label: "A" }, { type: "dot", id: 2, label: "B" }, { type: "stock", id: 3, label: "C" }, { type: "faucet", id: 4, label: "D" }];
// const links: Link[] = [{ source: "A", target: "B", type: "arrow" }, { source: "B", target: "C", type: "arrow" }, { source: "C", target: "D", type: "arrow" }, { source: "D", target: "A", type: "arrow" }]
// let nodes = [{ "label": "d", "id": "d" }]
// let links = [{ "type": "arrow", "target": "e", "source": "d" }]
const system: System = { nodes: systemNodes, links: systemLinks }

// .id(d => d.id)
const simulation = d3.forceSimulation<Node, Link>(systemNodes)
  .force("link", d3.forceLink<Node, Link>(systemLinks).id(d => d.id).distance(80))
  .force("charge", d3.forceManyBody<Node>().strength(-200))
  .force("center", d3.forceCenter<Node>(svgWidth / 2, svgHeight / 2))
  .force("x", d3.forceX<Node>(svgWidth / 2).strength(0.05))
  .force("y", d3.forceY<Node>(svgHeight / 2).strength(0.05))
  .on("tick", ticked);

let nextId = systemNodes.length;

// Draw the graph
update(system);

function update(system: System) {
  // Make a shallow copy to protect against mutation, while recycling old nodes to preserve position and velocity.
  const old = new Map(simulation.nodes().map(d => [d.id, d] as [string, Node]));
  const nodes = system.nodes.map(d => {
    const prev = old.get(d.id);
    return prev ? Object.assign(prev, d) : { ...d };
  });
  const links = system.links.map(d => ({ ...d }));

  link = link
    .data(links)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", "#999");
  nodeDot = nodeDot
    .data(nodes.filter(x => x.type === 'dot'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("circle")
        .attr("r", dotRadius)
        .attr("fill", "rgba(0, 0, 255, 0.5)")
        .attr("stroke", "#00f")
        .attr("stroke-width", 1.5);
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeStock = nodeStock
    .data(nodes.filter(x => x.type === 'stock'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("rect")
        .attr("x", -stockWidth / 2)
        .attr("y", -stockHeight / 2)
        .attr("width", stockWidth)
        .attr("height", stockHeight)
        .attr("stroke", "#f00")
        .attr("stroke-width", 1.5)
        .attr("fill", "rgba(255, 0, 0, 0.5)");
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeFaucet = nodeFaucet
    .data(nodes.filter(x => x.type === 'faucet'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("image")
        .attr("href", faucetSvg)
        .attr("x", -faucetWidth / 2)
        .attr("y", -faucetHeight / 2)
        .attr("width", faucetWidth)
        .attr("height", faucetHeight);
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeCloud = nodeCloud
    .data(nodes.filter(x => x.type === 'cloud'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("image")
        .attr("href", cloudSvg)
        .attr("x", -cloudWidth / 2)
        .attr("y", -cloudHeight / 2)
        .attr("width", cloudWidth)
        .attr("height", cloudHeight);
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);

  simulation.nodes(nodes);

  const linkForce = simulation.force<d3.ForceLink<Node, Link>>("link");
  if (!linkForce) {
    throw new Error("Link force is not defined in the simulation.");
  }
  linkForce.links(links);
  simulation.alpha(0.5).restart();
}

function ticked() {
  nodeDot.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeStock.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeFaucet.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeCloud.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

  link
    .attr("d", d => {
      const source = d.source as Node;
      const target = d.target as Node;
      const dx = (target.x ?? 0) - (source.x ?? 0);
      const dy = (target.y ?? 0) - (source.y ?? 0);
      const dr = Math.hypot(dx, dy);
      return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
    });
}

function click(event: MouseEvent) {
  const [x, y] = d3.pointer(event);
  nextId++;
  const newNode: Node = { type: "dot", id: `${nextId}`, label: `${nextId}`, x, y };
  const nearest = systemNodes[systemNodes.length - 1];
  if (nearest) {
    systemLinks.push({ source: nearest.id, target: newNode.id, type: "arrow" });
  }
  systemNodes.push(newNode);
  update({ ...system });
}

function loadExample(text: string) {
  textInput.property('value', text);
  textInput.node()?.dispatchEvent(new Event('input'));
}

// Append a centered text label to a per-node <g>. The text is drawn on top of
// the node's shape and moves with it (the group carries the transform).
function appendLabel(g: d3.Selection<SVGGElement, Node, SVGGElement, unknown>) {
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.32em")
    .attr("font-size", 10)
    .attr("font-family", "sans-serif")
    .attr("fill", "#000")
    .attr("pointer-events", "none");
}

function drag() {
  return d3.drag<any, Node>()
    .on("start", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    })
}
