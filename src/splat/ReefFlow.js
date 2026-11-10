const key = node => node.slice(0, 2).join(',');

// Integrate transit time through the connected drainage tree. Narrow branches
// fill more slowly, and every child inherits the arrival time at its junction.
export function reefFlowCoordinates(paths, mapPoint) {
  const incoming = new Map(), nodes = new Map();
  for (const path of paths) for (let i = 0; i < path.length; i++) {
    const node = path[i], id = key(node);
    nodes.set(id, node);
    if (i) {
      const parent = path[i - 1];
      const length = mapPoint(node).distanceTo(mapPoint(parent));
      const area = Math.max(.001, (node[2] + parent[2]) * .5);
      const speed = .38 + .62 * area ** .22;
      const resistance = 1 + .12 * Math.sin(node[0] * 31 + node[1] * 23);
      incoming.set(id, {parent: key(parent), cost: length * resistance / speed});
    }
  }
  const arrivals = new Map(), visiting = new Set();
  function arrival(id) {
    if (arrivals.has(id)) return arrivals.get(id);
    if (visiting.has(id)) throw new Error('Coral flow requires an acyclic branch network.');
    visiting.add(id);
    const edge = incoming.get(id);
    const value = edge ? arrival(edge.parent) + edge.cost : 0;
    visiting.delete(id);arrivals.set(id, value);
    return value;
  }
  let maximum = 0;
  for (const id of nodes.keys()) maximum = Math.max(maximum, arrival(id));
  return node => arrivals.get(key(node)) / Math.max(maximum, .0001);
}
