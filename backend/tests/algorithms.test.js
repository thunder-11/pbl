import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traceAlgorithm,
  comparisonInput,
  measureComparison,
  validateInput,
} from '../src/algorithms.js';
import { normalizeOutput } from '../src/utils.js';
const graph = {
  vertices: ['A', 'B', 'C', 'D', 'E'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
  ],
  start: 'A',
  directed: false,
};
for (const algorithm of ['BUBBLE_SORT', 'SELECTION_SORT', 'INSERTION_SORT', 'MERGE_SORT'])
  for (const input of [[3, 2, 1], [1, 2, 3, 4], [-2, 0, -2, 3], [4], [2, 2, 2]])
    test(`${algorithm} sorts ${JSON.stringify(input)} without changing its input`, () => {
      const raw = { array: [...input] },
        trace = traceAlgorithm(algorithm, raw);
      assert.deepEqual(
        trace.at(-1).array,
        [...input].sort((a, b) => a - b),
      );
      assert.deepEqual(raw.array, input);
      assert.equal(trace.at(-1).done, true);
      assert.deepEqual(trace, traceAlgorithm(algorithm, raw));
      assert.equal(trace.at(-1).recursionFrames.length, 0);
    });
test('Binary Search narrows mid2 to low3 and finds index3', () => {
  const trace = traceAlgorithm('BINARY_SEARCH', { array: [2, 4, 6, 8, 10], target: 8 });
  assert.deepEqual(
    trace.filter((s) => s.event === 'PROBE').map((s) => s.pointers.mid),
    [2, 3],
  );
  const probe = trace.findIndex((s) => s.event === 'PROBE');
  assert.equal(trace[probe + 1].pointers.low, 3);
  assert.equal(trace.at(-1).pointers.targetIndex, 3);
  assert.equal(trace.at(-1).counters.comparisons, 2);
});
test('Searches report missing targets and Linear Search returns the first duplicate', () => {
  assert.equal(
    traceAlgorithm('LINEAR_SEARCH', { array: [2, 2, 3], target: 2 }).at(-1).pointers.targetIndex,
    0,
  );
  for (const a of ['LINEAR_SEARCH', 'BINARY_SEARCH'])
    assert.equal(
      traceAlgorithm(a, { array: [2, 4, 6], target: 1 }).at(-1).pointers.targetIndex,
      -1,
    );
});
test('Stack underflow and overflow do not mutate storage', () => {
  const trace = traceAlgorithm('STACK', {
    initial: [],
    capacity: 1,
    operations: [
      { type: 'POP' },
      { type: 'PUSH', value: 2 },
      { type: 'PUSH', value: 5 },
      { type: 'PEEK' },
      { type: 'POP' },
    ],
  });
  assert.deepEqual(trace.find((s) => s.event === 'UNDERFLOW').stack, []);
  assert.deepEqual(trace.find((s) => s.event === 'OVERFLOW').stack, [2]);
  assert.deepEqual(trace.at(-1).stack, []);
  assert.match(trace.find((s) => s.event === 'PEEK').message, /2/);
});
test('Queue removes FIFO values', () => {
  const trace = traceAlgorithm('QUEUE', {
    initial: [],
    capacity: 2,
    operations: [{ type: 'ENQUEUE', value: 2 }, { type: 'ENQUEUE', value: 5 }, { type: 'DEQUEUE' }],
  });
  assert.deepEqual(trace.at(-1).queue, [5]);
});
test('BFS queue discovery and DFS preorder skip disconnected E', () => {
  const bfs = traceAlgorithm('BFS', graph),
    dfs = traceAlgorithm('DFS', graph);
  assert.deepEqual(bfs.at(-1).visited, ['A', 'B', 'C', 'D']);
  assert.deepEqual(dfs.at(-1).visited, ['A', 'B', 'D', 'C']);
  assert.equal(bfs.at(-1).counters.visits, 4);
  const dequeue = bfs.findIndex((s) => s.event === 'DEQUEUE');
  assert.deepEqual(bfs[dequeue + 1].visited, ['A']);
  assert.equal(
    new Set(bfs.filter((s) => s.event === 'ENQUEUE').map((s) => s.queue.at(-1))).size,
    4,
  );
});
for (const [order, expected] of [
  ['INORDER', [1, 2, 3, 4, 6]],
  ['PREORDER', [4, 2, 1, 3, 6]],
  ['POSTORDER', [1, 3, 2, 6, 4]],
])
  test(`BST ${order} golden traversal`, () =>
    assert.deepEqual(
      traceAlgorithm('BST', {
        values: [4, 2, 6, 1, 3],
        operations: [{ type: 'TRAVERSE', order }],
      }).at(-1).visited,
      expected,
    ));
test('BST two-child deletion uses a successor and duplicate insert is ignored', () => {
  const trace = traceAlgorithm('BST', {
    values: [4, 2, 6, 1, 3],
    operations: [
      { type: 'INSERT', value: 4 },
      { type: 'DELETE', value: 4 },
      { type: 'TRAVERSE', order: 'INORDER' },
    ],
  });
  assert.ok(trace.some((s) => s.event === 'DUPLICATE'));
  assert.deepEqual(trace.at(-1).visited, [1, 2, 3, 6]);
  assert.equal(trace.at(-1).tree.length, 4);
});
for (const [algorithm, input] of [
  ['BINARY_SEARCH', { array: [3, 1, 2], target: 1 }],
  ['BUBBLE_SORT', { array: [] }],
  ['BUBBLE_SORT', { array: [1.2] }],
  ['BUBBLE_SORT', { array: [1], userId: 'fake' }],
  ['BST', { values: [1, 1], operations: [{ type: 'SEARCH', value: 1 }] }],
  ['BFS', { ...graph, edges: [{ from: 'A', to: 'Z' }] }],
  ['BFS', { ...graph, vertices: ['A', 'A'] }],
  ['BFS', { ...graph, edges: [{ from: 'A', to: 'A' }] }],
  ['QUEUE', { initial: [1, 2], capacity: 1, operations: [{ type: 'DEQUEUE' }] }],
])
  test(`${algorithm} rejects invalid closed input ${JSON.stringify(input)}`, () =>
    assert.throws(
      () => validateInput(algorithm, input),
      (e) => e.code === 'INVALID_SIMULATION_INPUT',
    ));
test('Comparison [3,2,1] has exact documented counts', () => {
  const [bubble, merge] = measureComparison([3, 2, 1]);
  assert.deepEqual(
    [bubble.comparisons, bubble.swaps, bubble.mainWrites, bubble.auxiliaryWrites],
    [3, 3, 6, 0],
  );
  assert.deepEqual(
    [merge.comparisons, merge.swaps, merge.mainWrites, merge.auxiliaryWrites],
    [2, 0, 5, 5],
  );
});
test('Sorted/reverse size4 golden counters', () => {
  assert.deepEqual(
    measureComparison([1, 2, 3, 4]).map((r) => [
      r.comparisons,
      r.swaps,
      r.mainWrites,
      r.auxiliaryWrites,
    ]),
    [
      [3, 0, 0, 0],
      [4, 0, 8, 8],
    ],
  );
  assert.deepEqual(
    measureComparison([4, 3, 2, 1]).map((r) => [
      r.comparisons,
      r.swaps,
      r.mainWrites,
      r.auxiliaryWrites,
    ]),
    [
      [6, 6, 12, 0],
      [4, 0, 8, 8],
    ],
  );
});
test('Seeded comparison generation is reproducible and range-bounded', () => {
  let input = comparisonInput({ arrangement: 'RANDOM', size: 128, seed: 123 });
  assert.deepEqual(input, comparisonInput({ arrangement: 'RANDOM', size: 128, seed: 123 }));
  assert.equal(input.length, 128);
  assert.ok(input.every((v) => Number.isInteger(v) && v >= -999 && v <= 999));
  assert.deepEqual(comparisonInput({ arrangement: 'DUPLICATES', size: 5 }), [2, 1, 2, 1, 2]);
});
for (const input of [
  { arrangement: 'SORTED', size: 129 },
  { arrangement: 'RANDOM', size: 8 },
  { arrangement: 'CUSTOM', input: [1.5, 2] },
  { arrangement: 'CUSTOM', input: [1] },
  { arrangement: 'SORTED', size: 4, input: [1, 2] },
])
  test('Invalid comparison ' + JSON.stringify(input), () =>
    assert.throws(
      () => comparisonInput(input),
      (e) => e.code === 'INVALID_COMPARISON_INPUT',
    ),
  );
test('Output normalization removes exactly one final LF and preserves spaces', () => {
  assert.equal(normalizeOutput('3\r\n'), normalizeOutput('3'));
  assert.notEqual(normalizeOutput('3 \n'), normalizeOutput('3'));
  assert.notEqual(normalizeOutput('3\n\n'), normalizeOutput('3\n'));
});
