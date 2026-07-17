import * as d3 from "d3";

import * as interpreter from '../output/Main/index'
import type { Node, Link, System } from "./type";
import { stockInit, stockHeight, stockTick, stockWidth } from "./shape/stock";
import { dotInit, dotTick } from "./shape/dot";
import { faucetInit, faucetUpdate, faucetHeight, faucetTick, faucetWidth } from "./shape/faucet";
import { cloudInit, cloudHeight, cloudTick, cloudWidth, cloudUpdate } from "./shape/cloud";
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


const width = 600
const height = 400
// Selection<BaseType | SVGLineElement, Link, SVGGElement, unknown>
// d3.Selection<SVGSVGElement, unknown, HTMLElement, any>

const svg: d3.Selection<SVGSVGElement, Node, HTMLElement, Link> = container
  .append('svg')
  .attr('class', 'svg')
  .style('order', 1) // flexbox ordering
  .style('width', width)
  .style('height', height)
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
  .selectAll("line");

const dotRadius = 20;
const stockWidth = 40;
const stockHeight = 40;
const faucetWidth = 40;
const faucetHeight = 40
const cloudWidth = 40;
const cloudHeight = 40;

let nodeDot = svg.append<SVGGElement>("g")
  .attr("r", 8)
  .attr("fill", "rgba(0, 0, 255, 0.5)")
  .attr("stroke", "#00f")
  .attr("stroke-width", 1.5)
  .selectAll<SVGCircleElement, Node>("circle");
let nodeStock = svg.append<SVGGElement>("g")
  .selectAll<SVGRectElement, Node>("rect")
let nodeFaucet = svg.append<SVGGElement>("g")
  .selectAll<SVGImageElement, Node>("image")
// let nodeFaucet = svg.append<SVGGElement>("g")
//   .selectAll<SVGRectElement, Node>("rect")
// let nodeFaucet = svg.append<SVGGElement>("g")
//   .selectAll<SVGImageElement, Node>("image")
let nodeCloud = svg.append<SVGGElement>("g")
  .selectAll<SVGRectElement, Node>("rect");

let nodeLabel = svg.append("g")
  .attr("class", "labels")
  .attr("pointer-events", "none")
  .attr("font-size", 10)
  .attr("font-family", "sans-serif")
  .attr("text-anchor", "middle")
  .attr("fill", "#000")
  .selectAll("text")

// const nodes = []
// const links = []
const nodes: Node[] = [{ type: "dot", id: "A", label: "A" }, { type: "dot", id: "B", label: "B" }, { type: "stock", id: "C", label: "C" }, { type: "faucet", id: "D", label: "D" }];
const links: Link[] = [{ source: "A", target: "B", type: "arrow" }, { source: "B", target: "C", type: "arrow" }, { source: "C", target: "D", type: "arrow" }, { source: "D", target: "A", type: "arrow" }]
// let nodes = [{ "label": "d", "id": "d" }]
// let links = [{ "type": "arrow", "target": "e", "source": "d" }]
const system: System = { nodes, links }

const simulation = d3.forceSimulation<Node, Link>(nodes)
  .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(80))
  .force("charge", d3.forceManyBody<Node>().strength(-200))
  .force("center", d3.forceCenter<Node>(width / 2, height / 2))
  .force("x", d3.forceX<Node>(width / 2).strength(0.05))
  .force("y", d3.forceY<Node>(height / 2).strength(0.05))
  .on("tick", ticked);

let nextId = nodes.length;

function update(system: System) {
  // Make a shallow copy to protect` against mutation, while recycling old nodes to preserve position and velocity.
  let { nodes, links } = system;
  const oldStock = new Map(nodeStock.data().map(d => [d.id, d]));
  // nodes = nodes.map(d => ({ ...oldStock.get(d.id), ...d }));
  // links = links.map(d => ({ ...d }));

  link = link
    .data(links)
    .join("line")
    .attr("stroke", "#999");
  nodeDot = nodeDot
    .data(nodes.filter(x => x.type === 'dot'))
    .join("circle")
    .call(drag(), undefined);
  nodeStock = nodeStock
    .data(nodes.filter(x => x.type === 'stock'))
    .join("rect")
    .attr("stroke", "#f00")
    .attr("stroke-width", 1.5)
    .attr("fill", "rgba(255, 0, 0, 0.5)")
    .attr("width", stockWidth)
    .attr("height", stockHeight)
    .call(drag(), undefined)
  nodeFaucet = nodeFaucet.data(nodes.filter(x => x.type === 'faucet'))
    .join("image")
    .attr("href", faucetSvg)
    .attr("width", faucetWidth)
    .attr("height", faucetHeight)
    .call(drag(), undefined);
  nodeCloud = nodeCloud.data(nodes.filter(x => x.type === 'cloud'))
    .join("image")
    .attr("href", cloudSvg)
    .attr("width", cloudWidth)
    .attr("height", cloudHeight)
    .call(drag(), undefined);
  nodeLabel = nodeLabel
    .data(nodes)
    .join("text")
    .text(d => d.type)

  simulation.nodes(nodes);

  const linkForce = simulation.force("link");
  if (!linkForce) {
    throw new Error("Link force is not defined in the simulation.");
  }
  linkForce.links(links);
  simulation.alpha(0.5).restart();
}

// Draw the graph
update(system);

function ticked() {
  nodeStock
    .attr("x", d => d.x - stockWidth / 2)
    .attr("y", d => d.y - stockHeight / 2);
  nodeDot
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", dotRadius);
  nodeFaucet
    .attr("x", d => d.x - faucetWidth / 2)
    .attr("y", d => d.y - faucetHeight / 2);
  nodeCloud
    .attr("x", d => d.x - cloudWidth / 2)
    .attr("y", d => d.y - cloudHeight / 2);
  nodeLabel
    .attr("x", d => d.x ?? 0)
    .attr("y", d => (d.y ?? 0) + 3)

  link
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);
}

function click(event: MouseEvent) {
  const [x, y] = d3.pointer(event);
  nextId++;
  const newNode: Node = { type: "dot", id: `N${nextId}`, label: `{nextId}`, x, y };
  if (nodes.length > 0) {
    const nearest = nodes[nodes.length - 1];
    links.push({ source: nearest.id, target: newNode.id, type: "arrow" });
  }
  nodes.push(newNode);
  update({ ...system });
}

function loadExample(text: string) {
  textInput.property('value', text);
  textInput.node()?.dispatchEvent(new Event('input'));
}

function drag() {
  return d3.drag()
    .on("start", (event, d: Node) => {
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
