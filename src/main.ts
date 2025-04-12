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

  // Create and populate labels container with checkboxes
  const labelsContainer = document.getElementById('labels-container');
  
  // Add scrollable styles to the container
  Object.assign(labelsContainer.style, {
    maxHeight: '60vh',
    overflowY: 'auto',
    overflowX: 'hidden'
  });

  labels.forEach(label => {
    const checkboxDiv = document.createElement('div');
    
    // Get the color from the first node that has this label
    const nodeWithLabel = graph.filterNodes((node, attributes) => 
      attributes.labels?.includes(label)
    )[0];
    const labelColor = graph.getNodeAttribute(nodeWithLabel, 'color') || '#666666';
    
    checkboxDiv.className = 'label-item';
    checkboxDiv.style.color = labelColor;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `label-${label}`;
    checkbox.value = label;
    
    // Add checkbox event listener
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.checked) {
        state.selectedLabels.add(label);
      } else {
        state.selectedLabels.delete(label);
      }
      renderer.refresh();
    });
    
    const labelElement = document.createElement('label');
    labelElement.htmlFor = `label-${label}`;
    labelElement.textContent = label;
    
    checkboxDiv.appendChild(checkbox);
    checkboxDiv.appendChild(labelElement);
    labelsContainer.appendChild(checkboxDiv);
  });

  new autoComplete({ 
    selector: "#search-input",
    data: {
      src: () => {
        const nodes = graph.nodes()
          .filter(n => {
            if (state.selectedLabels.size > 0) {
              const nodeLabels = graph.getNodeAttribute(n, 'labels') || [];
              return nodeLabels.some(label => state.selectedLabels.has(label));
            }
            return true;
          })
          .map((n) => graph.getNodeAttribute(n, "label"));
        return nodes;
      }
    },
    resultsList: {
      maxResults: 10
    }
  });


  const renderer = new Sigma(graph, container, {
    renderLabels: true,
    minNodeSize: 3,
    maxNodeSize: 10,
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
  selectedLabels: Set<string>;  // Add this new state property

  // State derived from query:
  selectedNode?: string;
  suggestions?: Set<string>;

  // State derived from hovered node:
  hoveredNeighbors?: Set<string>;
}
const state: State = { 
  searchQuery: "", 
  selectedLabels: new Set()  // Initialize the set
};



// Actions:
function setSearchQuery(query: string) {
  state.searchQuery = query;

  if (searchInput.value !== query) searchInput.value = query;

  if (query) {
    const lcQuery = query.toLowerCase();
    const suggestions = graph
      .nodes()
      .filter(n => {
        // If labels are selected, only search nodes with those labels
        if (state.selectedLabels.size > 0) {
          const nodeLabels = graph.getNodeAttribute(n, 'labels') || [];
          return nodeLabels.some(label => state.selectedLabels.has(label));
        }
        return true; // If no labels selected, search all nodes
      })
      .map((n) => ({ id: n, label: graph.getNodeAttribute(n, "label") as string }))
      .filter(({ label }) => label.toLowerCase().includes(lcQuery));

    if (suggestions.length === 1 && suggestions[0].label === query) {
      state.selectedNode = suggestions[0].id;
      state.suggestions = undefined;

      const nodePosition = renderer.getNodeDisplayData(state.selectedNode) as Coordinates;
      renderer.getCamera().animate(nodePosition, {
        duration: 500,
      });
    } else {
      state.selectedNode = undefined;
      state.suggestions = new Set(suggestions.map(({ id }) => id));
    }
  } else {
    state.selectedNode = undefined;
    state.suggestions = undefined;
  }

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
// Modify the nodeReducer
renderer.setSetting("nodeReducer", (node, data) => {
  const res: Partial<NodeDisplayData> = { ...data };
  // Normalize outlier sizes
  if (res.size) {
    if (res.size > 10) res.size = 10;
    if (res.size < 2) res.size = res.size * 1.5;
  }

  // Handle label filtering
  if (state.selectedLabels.size > 0) {
    const nodeLabels = graph.getNodeAttribute(node, 'labels') || [];
    const hasSelectedLabel = nodeLabels.some(label => state.selectedLabels.has(label));
    if (!hasSelectedLabel) {
      res.hidden = true;
      res.color = "#f6f6f6";
      res.label = "";
      return res;
    }
  }

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
