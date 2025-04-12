import Sigma from "sigma";
import Graph from "graphology";
import { parse } from "graphology-gexf";
import { Coordinates, EdgeDisplayData, NodeDisplayData } from "sigma/types";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";

// Load and parse GEXF graph
async function loadGraph(): Promise<Graph> {
  const response = await fetch("/aub.gexf");
  const gexfText = await response.text();

  const graph = parse(Graph, gexfText);

  return graph;
}


// Mount Sigma renderer
loadGraph().then((graph) => {
  const container = document.getElementById("sigma-container") as HTMLElement;
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  
  let labels: any[] = [];

  graph.mapNodes((item, attri) => {
    labels.push(...attri.labels);
  });
  labels = [...new Set(labels)];


  new autoComplete({ 
    selector: "#search-input",
    data: {
      src: graph.mapNodes((item, attri) => attri.label)
    }
  });


  const renderer = new Sigma(graph, container, {

  });

  const sensibleSettings = forceAtlas2.inferSettings(graph);
  const fa2Layout = new FA2Layout(graph, {
    settings: sensibleSettings,
  });

    // correlate start/stop actions with state management
    function stopFA2() {
      fa2Layout.stop();
    }
    function startFA2() {
      fa2Layout.start();
    }
    
// startFA2()
// Type and declare internal state:
interface State {
  hoveredNode?: string;
  searchQuery: string;

  // State derived from query:
  selectedNode?: string;
  suggestions?: Set<string>;

  // State derived from hovered node:
  hoveredNeighbors?: Set<string>;
}
const state: State = { searchQuery: "" };



// Actions:
function setSearchQuery(query: string) {
  state.searchQuery = query;

  if (searchInput.value !== query) searchInput.value = query;

  if (query) {
    const lcQuery = query.toLowerCase();
    const suggestions = graph
      .nodes()
      .map((n) => ({ id: n, label: graph.getNodeAttribute(n, "label") as string }))
      .filter(({ label }) => label.toLowerCase().includes(lcQuery));

    // If we have a single perfect match, them we remove the suggestions, and
    // we consider the user has selected a node through the datalist
    // autocomplete:
    if (suggestions.length === 1 && suggestions[0].label === query) {
      state.selectedNode = suggestions[0].id;
      state.suggestions = undefined;

      // Move the camera to center it on the selected node:
      const nodePosition = renderer.getNodeDisplayData(state.selectedNode) as Coordinates;
      renderer.getCamera().animate(nodePosition, {
        duration: 500,
      });
    }
    // Else, we display the suggestions list:
    else {
      state.selectedNode = undefined;
      state.suggestions = new Set(suggestions.map(({ id }) => id));
    }
  }
  // If the query is empty, then we reset the selectedNode / suggestions state:
  else {
    state.selectedNode = undefined;
    state.suggestions = undefined;
  }

  // Refresh rendering
  // You can directly call `renderer.refresh()`, but if you need performances
  // you can provide some options to the refresh method.
  // In this case, we don't touch the graph data so we can skip its reindexation
  renderer.refresh({
    skipIndexation: true,
  });
}

function setHoveredNode(node?: string) {
  if (node) {
    state.hoveredNode = node;
    state.hoveredNeighbors = new Set(graph.neighbors(node));
  }

  if (!node) {
    state.hoveredNode = undefined;
    state.hoveredNeighbors = undefined;
  }

  // Refresh rendering
  renderer.refresh({
    // We don't touch the graph data so we can skip its reindexation
    skipIndexation: true,
  });
}

// Bind search input interactions:
searchInput.addEventListener("input", () => {
  setSearchQuery(searchInput.value || "");
});

searchInput.addEventListener("blur", () => {
  setSearchQuery("");
});

// Bind graph interactions:
renderer.on("enterNode", ({ node }) => {
  setHoveredNode(node);
});
renderer.on("leaveNode", () => {
  setHoveredNode(undefined);
});

// Render nodes accordingly to the internal state:
// 1. If a node is selected, it is highlighted
// 2. If there is query, all non-matching nodes are greyed
// 3. If there is a hovered node, all non-neighbor nodes are greyed
renderer.setSetting("nodeReducer", (node, data) => {
  const res: Partial<NodeDisplayData> = { ...data };

  if (state.hoveredNeighbors && !state.hoveredNeighbors.has(node) && state.hoveredNode !== node) {
    res.label = "";
    res.color = "#f6f6f6";
    res.hidden = true
  }

  if (state.selectedNode === node) {
    res.highlighted = true;
    res.forceLabel = true;
  } else if (state.suggestions) {
    if (state.suggestions.has(node)) {
      res.forceLabel = true;
    } else {
      res.label = "";
      res.color = "#f6f6f6";
    res.hidden = true

    }

  }

  return res;
});

// Render edges accordingly to the internal state:
// 1. If a node is hovered, the edge is hidden if it is not connected to the
//    node
// 2. If there is a query, the edge is only visible if it connects two
//    suggestions
renderer.setSetting("edgeReducer", (edge, data) => {
  const res: Partial<EdgeDisplayData> = { ...data };
  res.color = res.color
  .replace("rgb(", "rgba(")
  .replace(")", ", 0.8)");
  if (
    state.hoveredNode &&
    !graph.extremities(edge).every((n) => n === state.hoveredNode || graph.areNeighbors(n, state.hoveredNode))
  ) {
    res.hidden = true;
    res.color = "#000000"
  }else{
    
  }

  if (
    state.suggestions &&
    (!state.suggestions.has(graph.source(edge)) || !state.suggestions.has(graph.target(edge)))
  ) {
    res.hidden = true;
    res.color = "#000000"

  }

  return res;
});



});
