import { z } from 'zod';
import { fail } from './errors.js';
const number = z.number().int().min(-999).max(999);
const array = z.array(number).min(1).max(32);
const op = (t) => z.object({ type: z.literal(t) }).strict();
const valued = (t) => z.object({ type: z.literal(t), value: number }).strict();
export const algorithms = [
  'LINEAR_SEARCH',
  'BINARY_SEARCH',
  'BUBBLE_SORT',
  'SELECTION_SORT',
  'INSERTION_SORT',
  'MERGE_SORT',
  'STACK',
  'QUEUE',
  'BST',
  'BFS',
  'DFS',
];
const graphSchema = z
  .object({
    vertices: z
      .array(z.string().regex(/^[A-L]$/))
      .min(1)
      .max(12),
    edges: z.array(z.object({ from: z.string(), to: z.string() }).strict()).max(24),
    start: z.string(),
    directed: z.boolean(),
  })
  .strict();
export function validateInput(algorithm, input) {
  try {
    let schema;
    if (['LINEAR_SEARCH', 'BINARY_SEARCH'].includes(algorithm))
      schema = z.object({ array, target: number }).strict();
    else if (algorithm.endsWith('_SORT')) schema = z.object({ array }).strict();
    else if (['STACK', 'QUEUE'].includes(algorithm))
      schema = z
        .object({
          initial: z.array(number).max(16),
          capacity: z.number().int().min(1).max(16),
          operations: z
            .array(
              z.union(
                algorithm === 'STACK'
                  ? [valued('PUSH'), op('POP'), op('PEEK')]
                  : [valued('ENQUEUE'), op('DEQUEUE'), op('FRONT')],
              ),
            )
            .min(1)
            .max(32),
        })
        .strict();
    else if (algorithm === 'BST')
      schema = z
        .object({
          values: z.array(number).max(15),
          operations: z
            .array(
              z.union([
                valued('INSERT'),
                valued('SEARCH'),
                valued('DELETE'),
                z
                  .object({
                    type: z.literal('TRAVERSE'),
                    order: z.enum(['INORDER', 'PREORDER', 'POSTORDER']),
                  })
                  .strict(),
              ]),
            )
            .min(1)
            .max(16),
        })
        .strict();
    else if (['BFS', 'DFS'].includes(algorithm)) schema = graphSchema;
    else throw Error();
    const result = schema.parse(input);
    if (algorithm === 'BINARY_SEARCH' && result.array.some((v, i, a) => i && v < a[i - 1]))
      throw Error();
    if (result.capacity && result.initial.length > result.capacity) throw Error();
    if (
      algorithm === 'BST' &&
      (new Set(result.values).size !== result.values.length ||
        new Set([
          ...result.values,
          ...result.operations.filter((o) => o.type === 'INSERT').map((o) => o.value),
        ]).size > 15)
    )
      throw Error();
    if (result.vertices) {
      const vs = new Set(result.vertices),
        es = new Set();
      if (vs.size !== result.vertices.length || !vs.has(result.start)) throw Error();
      for (const e of result.edges) {
        let k = result.directed ? `${e.from}:${e.to}` : [e.from, e.to].sort().join(':');
        if (!vs.has(e.from) || !vs.has(e.to) || e.from === e.to || es.has(k)) throw Error();
        es.add(k);
      }
    }
    return result;
  } catch {
    fail(422, 'INVALID_SIMULATION_INPUT', 'Simulation input violates algorithm constraints');
  }
}
export function traceAlgorithm(algorithm, raw, { comparison = false } = {}) {
  const input = comparison
    ? z
        .object({ array: z.array(number).min(2).max(128) })
        .strict()
        .parse(raw)
    : validateInput(algorithm, raw);
  const state = {
    stepIndex: 0,
    event: 'INITIAL',
    array: [...(input.array || [])],
    pointers: {
      low: null,
      high: null,
      mid: null,
      i: null,
      j: null,
      currentNodeId: null,
      targetIndex: null,
    },
    stack: [...(input.initial || [])],
    queue: [...(input.initial || [])],
    tree: [],
    graph: input.vertices
      ? { vertices: input.vertices, edges: input.edges, directed: input.directed }
      : null,
    visited: [],
    recursionFrames: [],
    counters: { comparisons: 0, swaps: 0, mainWrites: 0, auxiliaryWrites: 0, visits: 0 },
    done: false,
    message: 'Input ready',
  };
  const states = [];
  const emit = (event, message = '') => {
    state.event = event;
    state.message = message;
    state.stepIndex = states.length;
    states.push(structuredClone(state));
    if (states.length > 10001)
      fail(422, 'INVALID_SIMULATION_INPUT', 'Input creates too many transitions');
  };
  emit('INITIAL', 'Inspect the initial state before the first operation.');
  const a = state.array,
    c = state.counters;
  if (algorithm === 'LINEAR_SEARCH') {
    let found = -1;
    for (let i = 0; i < a.length; i++) {
      state.pointers.i = i;
      c.comparisons++;
      emit('COMPARE', `Compare ${a[i]} with ${input.target}.`);
      if (a[i] === input.target) {
        found = i;
        state.pointers.targetIndex = i;
        emit('FOUND', `Target found at index ${i}.`);
        break;
      }
      emit('ADVANCE', 'Move to the next element.');
    }
    if (found < 0) {
      state.pointers.targetIndex = -1;
      emit('NOT_FOUND', 'All elements checked; target is absent.');
    }
  }
  if (algorithm === 'BINARY_SEARCH') {
    let low = 0,
      high = a.length - 1,
      found = false;
    while (low <= high) {
      let mid = Math.floor((low + high) / 2);
      Object.assign(state.pointers, { low, high, mid });
      c.comparisons++;
      emit('PROBE', `Middle index ${mid} contains ${a[mid]}.`);
      if (a[mid] === input.target) {
        state.pointers.targetIndex = mid;
        emit('FOUND', `Target found at index ${mid}.`);
        found = true;
        break;
      }
      if (a[mid] < input.target) low = mid + 1;
      else high = mid - 1;
      Object.assign(state.pointers, { low, high });
      emit('NARROW', `Keep indices ${low} through ${high}.`);
    }
    if (!found) {
      state.pointers.targetIndex = -1;
      emit('NOT_FOUND', 'The search interval is empty.');
    }
  }
  if (algorithm === 'BUBBLE_SORT')
    for (let i = 0; i < a.length - 1; i++) {
      let changed = false;
      for (let j = 0; j < a.length - i - 1; j++) {
        Object.assign(state.pointers, { i, j });
        c.comparisons++;
        emit('COMPARE', `Compare adjacent values ${a[j]} and ${a[j + 1]}.`);
        if (a[j] > a[j + 1]) {
          [a[j], a[j + 1]] = [a[j + 1], a[j]];
          c.swaps++;
          c.mainWrites += 2;
          changed = true;
          emit('SWAP', 'Exchange the out-of-order adjacent values.');
        }
      }
      emit('PASS_END', 'The largest remaining value is in its final position.');
      if (!changed) break;
    }
  if (algorithm === 'SELECTION_SORT')
    for (let i = 0; i < a.length - 1; i++) {
      let min = i;
      for (let j = i + 1; j < a.length; j++) {
        Object.assign(state.pointers, { i, j, mid: min });
        c.comparisons++;
        emit('COMPARE', 'Compare the candidate against the smallest value so far.');
        if (a[j] < a[min]) {
          min = j;
          state.pointers.mid = min;
          emit('MIN_UPDATE', 'Remember the new minimum.');
        }
      }
      if (min !== i) {
        [a[min], a[i]] = [a[i], a[min]];
        c.swaps++;
        c.mainWrites += 2;
        emit('SWAP', 'Move the minimum into the sorted prefix.');
      }
      emit('PASS_END', 'The sorted prefix grows by one.');
    }
  if (algorithm === 'INSERTION_SORT')
    for (let i = 1; i < a.length; i++) {
      let key = a[i],
        j = i - 1;
      state.pointers.i = i;
      emit('PICK_KEY', `Insert key ${key} into the sorted prefix.`);
      while (j >= 0) {
        state.pointers.j = j;
        c.comparisons++;
        emit('COMPARE', `Compare ${a[j]} with key ${key}.`);
        if (a[j] <= key) break;
        a[j + 1] = a[j];
        c.mainWrites++;
        emit('SHIFT', 'Shift the larger value one position right.');
        j--;
      }
      a[j + 1] = key;
      c.mainWrites++;
      emit('INSERT', `Insert key ${key} at index ${j + 1}.`);
      emit('PASS_END', 'The prefix is sorted.');
    }
  if (algorithm === 'MERGE_SORT') {
    const merge = (low, high) => {
      if (low >= high) return;
      const mid = Math.floor((low + high) / 2);
      state.recursionFrames.push({ low, high, mid, phase: 'SPLIT' });
      emit('SPLIT', `Split range ${low}–${high} at ${mid}.`);
      merge(low, mid);
      merge(mid + 1, high);
      state.recursionFrames.at(-1).phase = 'MERGE';
      let left = a.slice(low, mid + 1),
        right = a.slice(mid + 1, high + 1),
        i = 0,
        j = 0,
        aux = [];
      while (i < left.length && j < right.length) {
        Object.assign(state.pointers, { i: low + i, j: mid + 1 + j });
        c.comparisons++;
        emit('COMPARE', 'Compare the two sorted heads.');
        aux.push(left[i] <= right[j] ? left[i++] : right[j++]);
        c.auxiliaryWrites++;
        emit('WRITE_AUX', 'Append the smaller head to the auxiliary range.');
      }
      while (i < left.length) {
        aux.push(left[i++]);
        c.auxiliaryWrites++;
        emit('WRITE_AUX', 'Copy the remaining left value.');
      }
      while (j < right.length) {
        aux.push(right[j++]);
        c.auxiliaryWrites++;
        emit('WRITE_AUX', 'Copy the remaining right value.');
      }
      for (let k = 0; k < aux.length; k++) {
        a[low + k] = aux[k];
        c.mainWrites++;
        emit('COPY_BACK', `Write the merged value at index ${low + k}.`);
      }
      state.recursionFrames.pop();
      emit('RETURN', 'Return a sorted range.');
    };
    merge(0, a.length - 1);
  }
  if (['STACK', 'QUEUE'].includes(algorithm)) {
    let container = algorithm === 'STACK' ? state.stack : state.queue;
    for (const operation of input.operations) {
      if (['PUSH', 'ENQUEUE'].includes(operation.type)) {
        if (container.length === input.capacity)
          emit('OVERFLOW', 'Capacity reached; the container is unchanged.');
        else {
          container.push(operation.value);
          emit(operation.type, `Add ${operation.value}.`);
        }
      } else if (!container.length)
        emit('UNDERFLOW', 'The container is empty; no value is removed.');
      else if (['POP', 'DEQUEUE'].includes(operation.type)) {
        let value = operation.type === 'POP' ? container.pop() : container.shift();
        emit(operation.type, `Remove ${value}.`);
      } else
        emit(
          operation.type,
          `Next value is ${operation.type === 'PEEK' ? container.at(-1) : container[0]}.`,
        );
    }
  }
  if (['BFS', 'DFS'].includes(algorithm)) {
    let adjacency = Object.fromEntries(input.vertices.map((v) => [v, []]));
    for (const e of input.edges) {
      adjacency[e.from].push(e.to);
      if (!input.directed) adjacency[e.to].push(e.from);
    }
    Object.values(adjacency).forEach((n) => n.sort());
    state.queue = [];
    state.stack = [];
    const discovered = new Set();
    if (algorithm === 'BFS') {
      discovered.add(input.start);
      state.queue.push(input.start);
      emit('ENQUEUE', 'Discover the start vertex.');
      while (state.queue.length) {
        let v = state.queue.shift();
        state.pointers.currentNodeId = v;
        emit('DEQUEUE', `Take ${v} from the front.`);
        state.visited.push(v);
        c.visits++;
        emit('VISIT', `Visit ${v}.`);
        for (const n of adjacency[v]) {
          emit('SCAN_EDGE', `Inspect edge ${v} to ${n}.`);
          if (!discovered.has(n)) {
            discovered.add(n);
            state.queue.push(n);
            emit('ENQUEUE', `Discover ${n} and place it at the back.`);
          }
        }
      }
    } else {
      const visit = (v) => {
        discovered.add(v);
        state.recursionFrames.push({ nodeId: v, nextNeighborIndex: 0, phase: 'ENTER' });
        state.pointers.currentNodeId = v;
        emit('ENTER', `Enter ${v}.`);
        state.visited.push(v);
        c.visits++;
        emit('VISIT', `Visit ${v}.`);
        for (const [nIndex, n] of adjacency[v].entries()) {
          state.recursionFrames.at(-1).nextNeighborIndex = nIndex;
          emit('SCAN_EDGE', `Inspect edge ${v} to ${n}.`);
          if (!discovered.has(n)) {
            emit('RECURSE', `Explore ${n} before returning.`);
            visit(n);
          }
        }
        state.recursionFrames.pop();
        emit('RETURN', `Return from ${v}.`);
      };
      visit(input.start);
    }
  }
  if (algorithm === 'BST') {
    let root = null,
      next = 0;
    const nodes = state.tree,
      get = (v) => nodes.find((n) => n.nodeId === v),
      add = (value) => {
        if (root === null) {
          root = `n${next++}`;
          nodes.push({ nodeId: root, value, leftId: null, rightId: null });
          emit('INSERT', `Create root ${value}.`);
          return;
        }
        let node = get(root);
        while (node) {
          state.pointers.currentNodeId = node.nodeId;
          c.comparisons++;
          emit('COMPARE', `Compare ${value} with ${node.value}.`);
          if (value === node.value) {
            emit('DUPLICATE', 'Duplicate keys are not inserted.');
            return;
          }
          const side = value < node.value ? 'leftId' : 'rightId';
          if (!node[side]) {
            const nodeId = `n${next++}`;
            node[side] = nodeId;
            nodes.push({ nodeId, value, leftId: null, rightId: null });
            emit('INSERT', `Insert ${value} as a ${side === 'leftId' ? 'left' : 'right'} child.`);
            return;
          }
          node = get(node[side]);
        }
      };
    for (const v of input.values) add(v);
    const traversal = (nodeId, order) => {
      if (!nodeId) return;
      let n = get(nodeId);
      state.recursionFrames.push({ nodeId, phase: 'ENTER' });
      state.pointers.currentNodeId = nodeId;
      emit('VISIT', `Explore node ${n.value}.`);
      const output = () => {
        state.visited.push(n.value);
        c.visits++;
        emit('EMIT', `Output ${n.value}.`);
      };
      if (order === 'PREORDER') output();
      traversal(n.leftId, order);
      if (order === 'INORDER') output();
      traversal(n.rightId, order);
      if (order === 'POSTORDER') output();
      state.recursionFrames.pop();
      emit('RETURN', 'Return to the parent.');
    };
    const remove = (nodeId, value) => {
      if (!nodeId) {
        emit('NOT_FOUND', 'Key is absent.');
        return null;
      }
      let n = get(nodeId);
      state.pointers.currentNodeId = nodeId;
      c.comparisons++;
      emit('COMPARE', `Compare delete key ${value} with ${n.value}.`);
      if (value < n.value) n.leftId = remove(n.leftId, value);
      else if (value > n.value) n.rightId = remove(n.rightId, value);
      else {
        if (!n.leftId || !n.rightId) {
          let replacement = n.leftId || n.rightId;
          nodes.splice(nodes.indexOf(n), 1);
          emit('DELETE', `Remove ${value}.`);
          return replacement;
        }
        let successor = get(n.rightId);
        while (successor.leftId) successor = get(successor.leftId);
        n.value = successor.value;
        emit('RELINK', 'Replace the key with its inorder successor.');
        n.rightId = remove(n.rightId, successor.value);
      }
      return nodeId;
    };
    for (const o of input.operations) {
      if (o.type === 'INSERT') add(o.value);
      if (o.type === 'TRAVERSE') {
        state.visited = [];
        traversal(root, o.order);
      }
      if (o.type === 'DELETE') root = remove(root, o.value);
      if (o.type === 'SEARCH') {
        let n = get(root);
        let found = false;
        while (n) {
          state.pointers.currentNodeId = n.nodeId;
          c.comparisons++;
          emit('COMPARE', `Compare search key ${o.value} with ${n.value}.`);
          if (n.value === o.value) {
            found = true;
            emit('FOUND', 'Key found.');
            break;
          }
          n = get(o.value < n.value ? n.leftId : n.rightId);
        }
        if (!found) emit('NOT_FOUND', 'Key is absent.');
      }
    }
  }
  state.done = true;
  emit('DONE', 'All operations are complete.');
  return states;
}
export function comparisonInput({ arrangement, size, seed, input }) {
  try {
    if (arrangement === 'CUSTOM') {
      if (size !== undefined || seed !== undefined) throw Error();
      return z.array(number).min(2).max(128).parse(input);
    }
    if (
      !['SORTED', 'REVERSE', 'DUPLICATES', 'RANDOM'].includes(arrangement) ||
      !Number.isInteger(size) ||
      size < 2 ||
      size > 128 ||
      input !== undefined
    )
      throw Error();
    if (arrangement === 'RANDOM' && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295))
      throw Error();
    if (arrangement !== 'RANDOM' && seed !== undefined) throw Error();
    let x = seed;
    return Array.from({ length: size }, (_, i) =>
      arrangement === 'SORTED'
        ? i + 1
        : arrangement === 'REVERSE'
          ? size - i
          : arrangement === 'DUPLICATES'
            ? [2, 1, 2, 1][i % 4]
            : ((x = (Math.imul(1664525, x) + 1013904223) >>> 0) % 1999) - 999,
    );
  } catch {
    fail(422, 'INVALID_COMPARISON_INPUT', 'Comparison input violates constraints');
  }
}
export function measureComparison(input) {
  return ['BUBBLE_SORT', 'MERGE_SORT'].map((algorithm) => {
    let s = traceAlgorithm(algorithm, { array: [...input] }, { comparison: true }).at(-1);
    return { algorithm, ...s.counters, output: s.array };
  });
}
