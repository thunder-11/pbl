import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { M, transaction } from './models.js';
import { hash } from './utils.js';
import { traceAlgorithm, measureComparison } from './algorithms.js';
const catalogue = JSON.parse(
  readFileSync(new URL('./data/catalogue.json', import.meta.url), 'utf8'),
);
export const seedId = (label) => new mongoose.Types.ObjectId(hash(label).slice(0, 24));
const seedKey = (label) => {
  let h = hash(label);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const graph = {
  vertices: ['A', 'B', 'C', 'D'],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
    { from: 'B', to: 'D' },
  ],
  start: 'A',
  directed: false,
};
const metadata = {
  LINEAR_SEARCH: {
    input: { array: [4, 2, 7], target: 7 },
    complexity: 'O(n)',
    invariant: 'Check each element until a match is found.',
    question: 'Which index contains7 in [4,2,7]?',
    answer: '2',
    wrong: ['0', '1', '−1'],
    description:
      'Linear Search checks values from left to right. It works on unsorted data and returns the first matching index. A missing target requires examining every element.',
  },
  BINARY_SEARCH: {
    input: { array: [2, 4, 6, 8, 10], target: 8 },
    complexity: 'O(log n)',
    invariant: 'Keep the possible target inside the sorted low-to-high interval.',
    question: 'At mid2,value6,target8,what is the next low bound?',
    answer: '3',
    wrong: ['0', '1', '2'],
    code: 'BINARY_BOUNDARY_UPDATE',
    description:
      'Binary Search needs ascending sorted input. Compute mid=floor((low+high)/2). If the middle value is smaller than the target, set low=mid+1; otherwise keep the left half with high=mid−1. Equality ends the search.',
  },
  BUBBLE_SORT: {
    input: { array: [3, 2, 1] },
    complexity: 'O(n²)',
    invariant: 'After each pass, the largest remaining value is in its final position.',
    question: 'After the first comparison and swap on [3,2,1],what is the array?',
    answer: '[2,3,1]',
    wrong: ['[3,1,2]', '[1,2,3]', '[3,2,1]'],
    code: 'BUBBLE_ADJACENT_SWAP',
    description:
      'Bubble Sort compares adjacent pairs and swaps them only when the left value is larger. The unsorted range shrinks after each pass. A pass without swaps lets the algorithm stop early; equal values are not exchanged.',
  },
  SELECTION_SORT: {
    input: { array: [3, 1, 2] },
    complexity: 'O(n²)',
    invariant: 'The prefix contains the smallest values in ascending order.',
    question: 'Which value is selected first from [3,1,2]?',
    answer: '1',
    wrong: ['3', '2', 'No value'],
    description:
      'Selection Sort scans the unsorted range for its minimum and exchanges it with the first unsorted position. The minimum search still scans the range even when the input is already sorted. The ordinary swap-based version is not stable.',
  },
  INSERTION_SORT: {
    input: { array: [3, 1, 2] },
    complexity: 'O(n²)',
    invariant: 'Before taking the next key, the preceding prefix is sorted.',
    question: 'When inserting1 into the prefix [3],what happens to3?',
    answer: 'Shift it one position right.',
    wrong: ['Delete it.', 'Swap it with the last value.', 'Leave it before1.'],
    description:
      'Insertion Sort takes one key at a time, shifts preceding values greater than the key to the right, then writes the key into the resulting gap. It is stable when equal keys are not shifted and performs well on nearly sorted inputs.',
  },
  MERGE_SORT: {
    input: { array: [3, 2, 1] },
    complexity: 'O(n log n)',
    invariant: 'Every merge consumes two sorted ranges.',
    question: 'When one merge half is exhausted,what happens next?',
    answer: 'Copy every remaining value from the other half.',
    wrong: ['Discard the other half.', 'Restart the sort.', 'Compare against zero.'],
    code: 'MERGE_REMAINDER_COPY',
    description:
      'Merge Sort splits a range in half until single values remain, then merges sorted halves. Compare the two heads, append the smaller, and copy any remainder. This engine uses an auxiliary range and copies the merged result back.',
  },
  STACK: {
    input: {
      initial: [],
      capacity: 3,
      operations: [
        { type: 'PUSH', value: 2 },
        { type: 'PUSH', value: 5 },
        { type: 'PEEK' },
        { type: 'POP' },
      ],
    },
    complexity: 'O(1)',
    invariant: 'The last value pushed is the first value popped.',
    question: 'Push2 then5 into an empty stack.What does POP return?',
    answer: '5',
    wrong: ['2', '0', 'Both values'],
    description:
      'A stack is last-in,first-out. PUSH adds at the top,POP removes the top,and PEEK reads it without removal. An empty POP is underflow; adding to a full bounded stack is overflow. Neither error mutates the container.',
  },
  QUEUE: {
    input: {
      initial: [],
      capacity: 3,
      operations: [
        { type: 'ENQUEUE', value: 2 },
        { type: 'ENQUEUE', value: 5 },
        { type: 'FRONT' },
        { type: 'DEQUEUE' },
      ],
    },
    complexity: 'O(1)',
    invariant: 'The first value enqueued is the first value dequeued.',
    question: 'Enqueue2 then5 into an empty queue.What does DEQUEUE return?',
    answer: '2',
    wrong: ['5', '0', 'Both values'],
    description:
      'A queue is first-in,first-out. ENQUEUE adds at the rear,DEQUEUE removes from the front,and FRONT reads the next value. Bounded queues detect overflow and underflow without losing values. Real implementations can use circular storage to avoid shifting.',
  },
  BST: {
    input: { values: [4, 2, 6, 1, 3], operations: [{ type: 'TRAVERSE', order: 'INORDER' }] },
    complexity: 'O(h)',
    invariant: 'Every left key is smaller and every right key is larger.',
    question: 'What is the inorder traversal for inserted keys [4,2,6,1,3]?',
    answer: '[1,2,3,4,6]',
    wrong: ['[4,2,1,3,6]', '[1,3,2,6,4]', '[6,4,3,2,1]'],
    code: 'BST_TRAVERSAL_ORDER',
    description:
      'A Binary Search Tree orders keys recursively:left subtree smaller,right subtree larger. Inorder visits left,node,right and therefore emits ascending keys. Search follows one branch; deleting a two-child node replaces its key with the inorder successor. Height h determines search cost.',
  },
  BFS: {
    input: graph,
    complexity: 'O(V+E)',
    invariant: 'Discover a vertex when it is enqueued,so it enters the queue only once.',
    question: 'Immediately after dequeuing the start A,which vertex is visited next?',
    answer: 'A',
    wrong: ['B', 'C', 'D'],
    code: 'BFS_DISCOVERY_ORDER',
    description:
      'Breadth-First Search uses a FIFO queue to explore reachable vertices in layers. Mark a vertex discovered when enqueuing it. This workbench orders neighbors alphabetically,so the default graph visits A,B,C,D. Disconnected vertices are not visited automatically.',
  },
  DFS: {
    input: graph,
    complexity: 'O(V+E)',
    invariant: 'Visit a vertex once before recursively exploring its unseen neighbors.',
    question: 'With edges A–B,A–C,B–D and alphabetical neighbors,what is DFS preorder?',
    answer: '[A,B,D,C]',
    wrong: ['[A,B,C,D]', '[D,C,B,A]', '[A,C,D,B]'],
    description:
      'Depth-First Search explores one branch before returning. Recursive frames retain the current vertex and next neighbor. Mark visited on entry to prevent cycles. Alphabetical neighbors make replay deterministic; the default graph visits A,B,D,C.',
  },
};
const tests = {
  LINEAR_SEARCH: [
    ['3\n4 2 7\n7\n', '2\n'],
    ['3\n4 2 7\n9\n', '-1\n'],
  ],
  BINARY_SEARCH: [
    ['5\n2 4 6 8 10\n8\n', '3\n'],
    ['5\n2 4 6 8 10\n1\n', '-1\n'],
  ],
  BUBBLE_SORT: [
    ['3\n3 2 1\n', '1 2 3\n'],
    ['4\n2 2 -1 0\n', '-1 0 2 2\n'],
  ],
  SELECTION_SORT: [
    ['3\n3 1 2\n', '1 2 3\n'],
    ['4\n2 -1 2 0\n', '-1 0 2 2\n'],
  ],
  INSERTION_SORT: [
    ['3\n3 1 2\n', '1 2 3\n'],
    ['4\n2 -1 2 0\n', '-1 0 2 2\n'],
  ],
  MERGE_SORT: [
    ['3\n3 2 1\n', '1 2 3\n'],
    ['4\n2 -1 2 0\n', '-1 0 2 2\n'],
  ],
  STACK: [
    ['4\nPUSH 2\nPUSH 5\nPEEK\nPOP\n', '5\n5\n'],
    ['4\nPUSH 7\nPUSH 9\nPOP\nPEEK\n', '9\n7\n'],
  ],
  QUEUE: [
    ['4\nENQUEUE 2\nENQUEUE 5\nFRONT\nDEQUEUE\n', '2\n2\n'],
    ['4\nENQUEUE 7\nENQUEUE 9\nDEQUEUE\nFRONT\n', '7\n9\n'],
  ],
  BST: [
    ['5\n4 2 6 1 3\n', '1 2 3 4 6\n'],
    ['3\n2 1 3\n', '1 2 3\n'],
  ],
  BFS: [
    ['4 3 0\nA B\nA C\nB D\nA\n', 'A B C D\n'],
    ['5 3 0\nA B\nA C\nB D\nA\n', 'A B C D\n'],
  ],
  DFS: [
    ['4 3 0\nA B\nA C\nB D\nA\n', 'A B D C\n'],
    ['5 3 0\nA B\nA C\nB D\nA\n', 'A B D C\n'],
  ],
};
const starters = [
  {
    language: 'C',
    source:
      '#include <stdio.h>\n\nint main(void) {\n    // Read input and implement the exercise.\n    return 0;\n}\n',
  },
  {
    language: 'CPP',
    source:
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Read input and implement the exercise.\n    return 0;\n}\n',
  },
  {
    language: 'JAVA',
    source:
      'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Read input and implement the exercise.\n    }\n}\n',
  },
  {
    language: 'PYTHON',
    source:
      '# Read standard input and implement the exercise.\nimport sys\n\ndata = sys.stdin.read()\n',
  },
];
const dbms = {
  'course-2301303-u1-t1': {
    title: 'Relational model and SQL',
    code: 'DBMS_CONSTRAINT_VIOLATION',
    content:
      'A relation is a table with named attributes and domains. A primary key uniquely identifies a tuple and cannot be null. A foreign key must reference an existing candidate key unless null is permitted. SQL separates definition (DDL),data changes (DML),access control (DCL) and transaction boundaries (TCL). Relational algebra selection filters tuples; projection selects attributes.\n\nA Student relation can use studentId as its primary key. Two rows with the same studentId violate entity integrity,even if their names differ. SQL is studied as a query language here; no student SQL is executed against the application database.',
    questions: [
      [
        'Two student rows have the same primary-key value.Which rule is violated?',
        'Entity integrity.',
        ['No rule.', 'Only output ordering.', 'Only indexing speed.'],
      ],
      [
        'What does relational selection do?',
        'Filters tuples by a condition.',
        ['Chooses attribute names only.', 'Removes every key.', 'Changes the database user.'],
      ],
      ['Which SQL category defines table structure?', 'DDL', ['DML', 'DCL', 'TCL']],
      [
        'What does a foreign key enforce?',
        'A valid reference to a candidate key.',
        ['A sorted output.', 'A unique display name.', 'No concurrent readers.'],
      ],
      [
        'What is an attribute domain?',
        'The allowed set of values for an attribute.',
        ['The number of tables.', 'The database host name.', 'The size of an index.'],
      ],
    ],
  },
  'course-2301303-u5-t1': {
    title: 'Transaction management',
    code: 'DBMS_CONFLICT_SERIALIZABILITY',
    content:
      'A transaction is a logical unit of work. ACID means atomicity,consistency,isolation and durability. Concurrent schedules can interleave operations while preserving valid outcomes. Two operations conflict when they belong to different transactions,access the same item,and at least one is a write.\n\nTo test conflict serializability,create a vertex for each transaction and a directed edge for every ordered conflicting pair. An acyclic precedence graph gives a conflict-serializable schedule; a cycle prevents it. Two-phase locking acquires locks before releasing any. Recovery uses durable logs or shadow pages to preserve committed work after failures.',
    questions: [
      [
        'A precedence graph has a cycle.What follows?',
        'The schedule is not conflict serializable.',
        ['It is always serializable.', 'Both transactions committed.', 'There were no conflicts.'],
      ],
      [
        'Which operation pair can conflict on the same item?',
        'A write by T1 followed by a read by T2.',
        [
          'Two reads by different transactions.',
          'Two operations in one transaction only.',
          'Reads of different items.',
        ],
      ],
      [
        'What does atomicity require?',
        'All transaction changes happen or none do.',
        ['Every query is fast.', 'Every key is numeric.', 'Readers never wait.'],
      ],
      [
        'What characterizes two-phase locking?',
        'Acquire locks before the first lock is released.',
        [
          'Release every lock before reading.',
          'Never use write locks.',
          'Commit after each operation.',
        ],
      ],
      [
        'Which ACID property preserves committed changes after failure?',
        'Durability',
        ['Isolation', 'Atomicity', 'Consistency'],
      ],
    ],
  },
};
function questionSet(key, title, meta, sim) {
  let rows;
  if (dbms[key]) rows = dbms[key].questions;
  else {
    const final = traceAlgorithm(sim.algorithm, sim.defaultInput).at(-1),
      output = final.array.length
        ? JSON.stringify(final.array)
        : JSON.stringify(
            final.visited.length
              ? final.visited
              : sim.algorithm === 'STACK'
                ? final.stack
                : final.queue,
          );
    rows = [
      [meta.question, meta.answer, meta.wrong],
      [
        'What is the final data state for the default example?',
        output,
        [
          'An unsorted copy with every value doubled.',
          'No state is produced.',
          'All input values are deleted.',
        ],
      ],
      [
        'Which invariant should this algorithm preserve?',
        meta.invariant,
        [
          'Input values may change at random.',
          'Rendering speed changes the result.',
          'Repeated vertices must always be visited again.',
        ],
      ],
      [
        'What is the standard complexity for this operation or traversal?',
        meta.complexity,
        ['O(2ⁿ)', 'O(n!)', 'O(0)'],
      ],
      [
        'Why do identical inputs replay the same states?',
        'The transition rules and neighbor/order conventions are fixed.',
        [
          'The browser guesses the next state.',
          'Animation timing decides correctness.',
          'The editor compiles the animation.',
        ],
      ],
    ];
  }
  return rows.map(([prompt, correct, wrong], i) => {
    let texts = [correct, ...wrong],
      correctIndex = [0, 1, 2, 3, 0][i];
    [texts[0], texts[correctIndex]] = [texts[correctIndex], texts[0]];
    return {
      _id: seedId(`${key}-q${i + 1}`),
      topicId: seedId(key),
      key: `${key}-q${i + 1}`,
      version: 1,
      status: 'PUBLISHED',
      createdBy: seedId('admin'),
      prompt,
      options: texts.map((text, j) => ({
        optionId: 'ABCD'[j],
        text,
        misconceptionCode: i === 0 && j === 1 && meta.code ? meta.code : null,
      })),
      correctOptionId: 'ABCD'[correctIndex],
      explanation:
        `${correct} ${i === 0 ? meta.description || dbms[key]?.content.split('\n')[0] : ''}`.slice(
          0,
          2000,
        ),
    };
  });
}
export async function seedDatabase({
  studentPassword,
  facultyPassword,
  adminPassword,
  baseTime = new Date(),
  productionContentOnly = false,
} = {}) {
  if (productionContentOnly) {
    if (
      process.env.ALLOW_CURRICULUM_BOOTSTRAP !== 'true' ||
      !(await M.users.exists({ _id: seedId('admin'), role: 'ADMIN', status: 'ACTIVE' }))
    )
      throw Error('Explicit bootstrap approval and an initial administrator are required');
  } else if (
    process.env.NODE_ENV === 'production' ||
    !/_dev$|_test$/.test(mongoose.connection.name)
  )
    throw Error('Seed requires a development/test database');
  if (
    (await M.ruleConfigs.exists({ isActive: true })) &&
    (await M.curriculumNodes.exists({ key: 'course-2301212' }))
  )
    return;
  for (const value of productionContentOnly
    ? []
    : [studentPassword, facultyPassword, adminPassword])
    if (!value || value.length < 12) throw Error('Seed passwords must be provided at runtime');
  const courseIds = catalogue.map((c) => seedId(`course-${c.code}`));
  const users = [
    ['student-a', 'Student A', 'STUDENT', 'TY', courseIds, studentPassword],
    ['student-b', 'Student B', 'STUDENT', 'TY', courseIds, studentPassword],
    ['student-c', 'Student C', 'STUDENT', 'SY', [courseIds[0]], studentPassword],
    ['faculty-a', 'Faculty A', 'FACULTY', null, courseIds.slice(0, 2), facultyPassword],
    ['faculty-b', 'Faculty B', 'FACULTY', null, courseIds.slice(2), facultyPassword],
    ['admin', 'Demo Admin', 'ADMIN', null, [], adminPassword],
  ];
  const active = new Map(),
    nodes = [];
  for (const year of ['SY', 'TY']) {
    nodes.push({
      _id: seedId(year.toLowerCase()),
      kind: 'YEAR',
      key: year.toLowerCase(),
      title: year === 'SY' ? 'Second Year' : 'Third Year',
      sortOrder: year === 'SY' ? 1 : 2,
      parentId: null,
    });
    for (const semester of year === 'SY' ? [3, 4] : [5, 6])
      nodes.push({
        _id: seedId(`${year.toLowerCase()}-semester-${semester}`),
        kind: 'SEMESTER',
        key: `${year.toLowerCase()}-semester-${semester}`,
        title: `Semester ${semester}`,
        parentId: seedId(year.toLowerCase()),
        sortOrder: semester,
      });
  }
  for (const [courseIndex, course] of catalogue.entries()) {
    const key = `course-${course.code}`;
    nodes.push({
      _id: seedId(key),
      key,
      kind: 'SUBJECT',
      title: course.title,
      courseCode: course.code,
      parentId: seedId(`${course.year.toLowerCase()}-semester-${course.semester}`),
      sortOrder: courseIndex + 1,
      syllabusLabel: `KKW-2023/${course.year}/course-structure`,
    });
    for (const unit of course.units) {
      const unitKey = `${key}-u${unit.number}`;
      nodes.push({
        _id: seedId(unitKey),
        key: unitKey,
        kind: 'UNIT',
        title: unit.title,
        parentId: seedId(key),
        sortOrder: unit.number,
        syllabusLabel: `KKW-2023/${unit.source}/THEORY`,
      });
      for (const [i, title] of unit.topics.entries()) {
        const topicKey = `${unitKey}-t${i + 1}`;
        nodes.push({
          _id: seedId(topicKey),
          key: topicKey,
          kind: 'TOPIC',
          title,
          parentId: seedId(unitKey),
          sortOrder: i + 1,
          syllabusLabel: `KKW-2023/${unit.source}/${['Linear Search', 'Binary Search'].includes(title) ? 'PREREQUISITE_SUPPORT' : ['Bubble Sort', 'Selection Sort', 'Insertion Sort'].includes(title) ? 'LAB-p51' : 'THEORY'}`,
        });
        let algorithm = Object.keys(metadata).find(
          (a) => a.replaceAll('_', ' ').toLowerCase() === title.toLowerCase(),
        );
        if (title === 'Binary Search Tree') algorithm = 'BST';
        if (title === 'Breadth-First Search') algorithm = 'BFS';
        if (title === 'Depth-First Search') algorithm = 'DFS';
        if (topicKey === 'course-2311302-u2-t1') algorithm = 'BFS';
        if (algorithm || dbms[topicKey])
          active.set(topicKey, {
            title,
            algorithm,
            meta: algorithm
              ? structuredClone(metadata[algorithm])
              : { ...dbms[topicKey], description: dbms[topicKey].content },
          });
      }
    }
  }
  await transaction(async (session) => {
    if (!productionContentOnly)
      for (const [label, displayName, role, academicYear, subjectIds, pwd] of users)
        await M.users.updateOne(
          { _id: seedId(label) },
          {
            $setOnInsert: {
              email: `${label}@example.invalid`,
              displayName,
              role,
              academicYear,
              subjectIds,
              passwordHash: await bcrypt.hash(pwd, 12),
            },
          },
          { upsert: true, session },
        );
    for (const n of nodes)
      await M.curriculumNodes.updateOne(
        { _id: n._id },
        {
          $set: {
            ...n,
            status: 'PUBLISHED',
            createdBy: seedId('admin'),
            syllabusLabel: n.syllabusLabel || 'KKW-2023/course-structure',
          },
        },
        { upsert: true, session, runValidators: true },
      );
    const mappings = [];
    for (const [key, value] of active) {
      let meta = value.meta;
      if (key === 'course-2311302-u2-t1') {
        meta.code = 'AI_BFS_FRONTIER';
        meta.description +=
          ' In AI,this graph represents a problem state space; the queue is the search frontier.';
      }
      let sim = value.algorithm
        ? {
            _id: seedId(key + '-sim'),
            topicId: seedId(key),
            key: key + '-sim',
            version: 1,
            status: 'PUBLISHED',
            createdBy: seedId('admin'),
            title: key.startsWith('course-231') ? 'BFS state-space search' : value.title,
            algorithm: value.algorithm,
            engineVersion: '1.0.0',
            defaultInput: meta.input,
            enabledCheckpointIds: [],
          }
        : null;
      if (sim) await M.simulations.replaceOne({ _id: sim._id }, sim, { upsert: true, session });
      const content = `# ${value.title}\n\n${meta.description}\n\n## Work through the idea\n\n${value.algorithm ? `Default input: ${JSON.stringify(meta.input)}\n\nBefore advancing the simulator, predict the next operation. Watch the pointers, frontier or recursion frames, then explain why the invariant still holds.\n\n**Invariant:** ${meta.invariant}\n\n**Complexity:** ${meta.complexity}. Operation counts describe algorithmic work; animation time is not execution speed.` : 'Read the scenario, identify which rule applies, then justify your assessment answer. This topic intentionally has no SQL execution or simulated database connection.'}\n\n## Check your understanding\n\n${meta.question || 'How would changing one assumption alter the result?'}\n\nYour assessment score measures recent evidence. Completing an activity is a separate progress measure.`;
      await M.learningResources.replaceOne(
        { _id: seedId(key + '-resource') },
        {
          _id: seedId(key + '-resource'),
          topicId: seedId(key),
          key: key + '-resource',
          version: 1,
          status: 'PUBLISHED',
          createdBy: seedId('admin'),
          title: value.title,
          content,
        },
        { upsert: true, session },
      );
      const qs = questionSet(key, value.title, meta, sim);
      for (const q of qs)
        await M.questions.replaceOne({ _id: q._id }, q, { upsert: true, session });
      await M.assessments.replaceOne(
        { _id: seedId(key + '-assessment') },
        {
          _id: seedId(key + '-assessment'),
          topicId: seedId(key),
          key: key + '-assessment',
          version: 1,
          status: 'PUBLISHED',
          createdBy: seedId('admin'),
          title: `${value.title}: concept check`,
          questionIds: qs.map((q) => q._id),
          durationSeconds: 1200,
        },
        { upsert: true, session },
      );
      if (value.algorithm) {
        let testCases = tests[value.algorithm].map(([stdin, expectedStdout], i) => ({
          testId: i ? 'hidden-1' : 'sample-1',
          visibility: i ? 'HIDDEN' : 'SAMPLE',
          stdin,
          expectedStdout,
          misconceptionCode: i ? meta.code || null : null,
        }));
        const shape = ['BFS', 'DFS'].includes(value.algorithm)
          ? 'First line: vertexCount edgeCount directedFlag (0=undirected). Next: one from/to edge per line. Final line: start label. Vertices are A onward. Visit neighbors alphabetically. Output reachable labels separated by spaces.'
          : value.algorithm === 'BST'
            ? 'Read n and n distinct integers. Output the inorder traversal separated by spaces.'
            : ['STACK', 'QUEUE'].includes(value.algorithm)
              ? 'Read operation count,then one operation per line. Start empty with capacity16. Output one line for each read/remove operation.'
              : 'Read n and n integer values. For searches,read the target on the final line and output its zero-based index or -1; for sorting,output ascending values separated by spaces.';
        await M.codingExercises.replaceOne(
          { _id: seedId(key + '-exercise') },
          {
            _id: seedId(key + '-exercise'),
            topicId: seedId(key),
            key: key + '-exercise',
            version: 1,
            status: 'PUBLISHED',
            createdBy: seedId('admin'),
            title: `Implement ${value.title}`,
            prompt: `${meta.description}\n\n${shape}\nTerminate output with a newline. Input values are integers from -999 to999.`,
            starters,
            tests: testCases,
            limits: { cpuSeconds: 2, wallSeconds: 5, memoryKiB: 131072 },
          },
          { upsert: true, session },
        );
      }
      if (meta.code)
        mappings.push({
          code: meta.code,
          label:
            value.title === 'Transaction management' ? 'Conflict serializability' : value.title,
          topicId: seedId(key),
          revisionResourceId: seedId(key + '-resource'),
          simulationId: sim ? sim._id : null,
        });
    }
    const checkpoints = [
      {
        key: 'course-2301212-u1-t3',
        name: 'binary-boundary',
        type: 'MCQ',
        event: 'PROBE',
        selector: 'nextIndex',
        prompt: 'The middle value is6 and the target is8.What is the next low bound?',
        choices: [
          ['A', 'low =0', 0],
          ['B', 'low =3', 3],
          ['C', 'high =1', 1],
          ['D', 'found index2', 2],
        ],
        explanation: '6 is smaller than8,so exclude mid and everything to its left:low=mid+1=3.',
      },
      {
        key: 'course-2301212-u1-t4',
        name: 'bubble-swap',
        type: 'STATE_SELECT',
        event: 'COMPARE',
        selector: 'nextArray',
        prompt: 'Which array will the next operation produce?',
        choices: [
          ['A', '[2,3,1]', [2, 3, 1]],
          ['B', '[3,1,2]', [3, 1, 2]],
          ['C', '[1,2,3]', [1, 2, 3]],
        ],
        explanation: '3 is larger than2.The next step swaps that adjacent pair.',
      },
      {
        key: 'course-2301301-u1-t3',
        name: 'bfs-frontier',
        type: 'STATE_SELECT',
        event: 'DEQUEUE',
        selector: 'nextVisited',
        prompt: 'Which visited sequence appears immediately after dequeuing A?',
        choices: [
          ['A', '[A]', ['A']],
          ['B', '[B]', ['B']],
          ['C', '[A,B]', ['A', 'B']],
          ['D', '[A,C]', ['A', 'C']],
        ],
        explanation: 'The dequeued vertex A is visited before its neighbors are scanned.',
      },
    ];
    for (const cp of checkpoints) {
      const cpId = seedId(cp.name);
      await M.predictionCheckpoints.replaceOne(
        { _id: cpId },
        {
          _id: cpId,
          topicId: seedId(cp.key),
          simulationId: seedId(cp.key + '-sim'),
          key: cp.name,
          version: 1,
          status: 'PUBLISHED',
          createdBy: seedId('admin'),
          trigger: { event: cp.event, occurrence: 1 },
          questionType: cp.type,
          prompt: cp.prompt,
          choices: cp.choices.map(([choiceId, label, value]) => ({ choiceId, label, value })),
          expectedSelector: cp.selector,
          explanation: cp.explanation,
        },
        { upsert: true, session },
      );
      await M.simulations.updateOne(
        { _id: seedId(cp.key + '-sim') },
        { $set: { enabledCheckpointIds: [cpId] } },
        { session },
      );
    }
    await M.ruleConfigs.replaceOne(
      { version: 1 },
      {
        version: 1,
        isActive: true,
        thresholds: {
          weakBelow: 50,
          masteredAt: 80,
          minimumAssessments: 2,
          assessmentWindow: 3,
          recurrenceAttempts: 2,
          misconceptionWindowDays: 30,
        },
        misconceptions: mappings,
        createdBy: seedId('admin'),
      },
      { upsert: true, session },
    );
    if (productionContentOnly) {
      await M.auditEvents.create(
        [
          {
            actorId: seedId('admin'),
            action: 'SYSTEM_RECOMPUTE',
            targetCollection: 'curriculumNodes',
            summary:
              'Source-mapped curriculum initialized without demo accounts or synthetic histories',
          },
        ],
        { session },
      );
      return;
    }
    for (const [label, , role, , subjectIds] of users.filter((u) => u[2] === 'STUDENT'))
      for (const topic of nodes.filter((n) => n.kind === 'TOPIC')) {
        let u = nodes.find((n) => String(n._id) === String(topic.parentId));
        if (!subjectIds.some((id) => String(id) === String(u.parentId))) continue;
        await M.topicProgress.updateOne(
          { userId: seedId(label), topicId: topic._id },
          {
            $setOnInsert: {
              readConfirmations: [],
              completedCategories: [],
              availableCategories: active.has(topic.key)
                ? dbms[topic.key]
                  ? ['UNDERSTAND', 'ASSESS']
                  : ['UNDERSTAND', 'SIMULATE', 'ASSESS', 'CODE']
                : [],
              completionPercent: 0,
              masteryPercent: null,
              masteryBand: 'INSUFFICIENT',
              ruleVersion: 1,
            },
          },
          { upsert: true, session },
        );
      }
    const patterns = [
      ['student-a', 'course-2301301-u2-t2', 'AACDA', 80],
      ['student-a', 'course-2301301-u2-t2', 'ABCDA', 100],
      ['student-a', 'course-2301212-u1-t4', 'BAAAA', 20],
      ['student-a', 'course-2301212-u1-t4', 'BAADA', 40],
      ['student-b', 'course-2301212-u1-t3', 'BAAAA', 20],
      ['student-b', 'course-2301212-u1-t3', 'BAAAA', 20],
    ];
    for (const [index, [student, key, pattern, scorePercent]] of patterns.entries()) {
      const questions = await M.questions
          .find({ topicId: seedId(key), status: 'PUBLISHED' })
          .sort({ key: 1 })
          .session(session),
        createdAt = new Date(+baseTime - (6 - index) * 86400000),
        attemptId = seedId(`fixture-assessment-${index}`),
        snap = questions.map((q) => ({
          questionId: q._id,
          prompt: q.prompt,
          options: q.options.map((o) => o.toObject()),
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
        }));
      await M.assessmentAttempts.replaceOne(
        { _id: attemptId },
        {
          _id: attemptId,
          userId: seedId(student),
          topicId: seedId(key),
          assessmentId: seedId(key + '-assessment'),
          idempotencyKey: seedKey(`assessment-${index}`),
          requestHash: hash(index),
          status: 'SUBMITTED',
          questionSnapshot: snap,
          answers: questions.map((q, i) => ({ questionId: q._id, optionId: pattern[i] })),
          deadlineAt: new Date(+createdAt + 1200000),
          submittedAt: createdAt,
          scorePercent,
          sourceMode: 'FIXTURE',
          createdAt,
          updatedAt: createdAt,
        },
        { upsert: true, session, timestamps: false },
      );
      for (const [qIndex, q] of questions.entries())
        if (pattern[qIndex] !== q.correctOptionId) {
          let code = q.options.find((o) => o.optionId === pattern[qIndex])?.misconceptionCode;
          await M.mistakeEvidence.updateOne(
            { sourceKind: 'ASSESSMENT', sourceId: attemptId, itemId: String(q._id) },
            {
              $setOnInsert: {
                userId: seedId(student),
                topicId: seedId(key),
                classification: code ? 'CONCEPTUAL' : 'UNCLASSIFIED',
                misconceptionCode: code || null,
                createdAt,
              },
            },
            { upsert: true, session },
          );
        }
    }
    const bubbleKey = 'course-2301212-u1-t4',
      exercise = await M.codingExercises.findById(seedId(bubbleKey + '-exercise')).session(session);
    for (const [index, status] of [
      'PASSED',
      'COMPILE_ERROR',
      'RUNTIME_ERROR',
      'FAILED_TESTS',
    ].entries()) {
      const attemptId = seedId('fixture-code-' + index),
        results = exercise.tests
          .slice(0, index === 1 || index === 2 ? 1 : 2)
          .map((t, i) => ({
            testId: t.testId,
            dispatchStatus: 'UNSENT',
            outcome:
              index === 1
                ? 'COMPILE_ERROR'
                : index === 2
                  ? 'RUNTIME_ERROR'
                  : index === 3 && i === 1
                    ? 'WRONG_OUTPUT'
                    : 'OK',
            stdout: index === 3 && i === 1 ? '0\n' : t.expectedStdout,
            stderr: index === 2 ? 'SYNTHETIC runtime-error example' : '',
            compileOutput: index === 1 ? 'SYNTHETIC compilation-error example' : '',
            passed: index === 0 || (index === 3 && i === 0),
            pollCount: 0,
          }));
      await M.codingAttempts.replaceOne(
        { _id: attemptId },
        {
          _id: attemptId,
          userId: seedId('student-a'),
          topicId: seedId(bubbleKey),
          exerciseId: exercise._id,
          idempotencyKey: seedKey('fixture-code-' + index),
          requestHash: hash(index),
          mode: 'GRADE',
          language: ['CPP', 'C', 'JAVA', 'PYTHON'][index],
          sourceCode: '// SYNTHETIC HISTORY: no code was executed',
          status,
          testSnapshot: exercise.tests.map((t) => t.toObject()),
          results,
          deadlineAt: baseTime,
          finishedAt: baseTime,
          correct: false,
          sourceMode: 'FIXTURE',
        },
        { upsert: true, session },
      );
      if (index > 0)
        await M.mistakeEvidence.updateOne(
          {
            sourceKind: 'CODING',
            sourceId: attemptId,
            itemId: index === 3 ? 'hidden-1' : 'diagnostic',
          },
          {
            $setOnInsert: {
              userId: seedId('student-a'),
              topicId: seedId(bubbleKey),
              classification: index === 1 ? 'COMPILATION' : index === 2 ? 'RUNTIME' : 'CONCEPTUAL',
              misconceptionCode: index === 3 ? 'BUBBLE_ADJACENT_SWAP' : null,
            },
          },
          { upsert: true, session },
        );
    }
    for (const [index, [student, key, complete]] of [
      ['student-a', bubbleKey, true],
      ['student-a', 'course-2301212-u1-t3', true],
      ['student-b', 'course-2301212-u1-t3', false],
    ].entries()) {
      const sim = await M.simulations.findById(seedId(key + '-sim')).session(session),
        trace = traceAlgorithm(sim.algorithm, sim.defaultInput),
        cp = await M.predictionCheckpoints.findOne({ simulationId: sim._id }).session(session),
        checkpointCursor = trace.findIndex((s) => s.event === cp.trigger.event),
        cursor = complete ? trace.length - 1 : checkpointCursor,
        sessionId = seedId('fixture-session-' + index);
      await M.simulationSessions.replaceOne(
        { _id: sessionId },
        {
          _id: sessionId,
          userId: seedId(student),
          topicId: seedId(key),
          simulationId: sim._id,
          input: sim.defaultInput,
          inputHash: hash(sim.defaultInput),
          engineVersion: '1.0.0',
          idempotencyKey: seedKey('fixture-session-' + index),
          requestHash: hash(index),
          status: complete ? 'COMPLETED' : 'PAUSED',
          cursor,
          maxCursor: cursor,
          traceLength: trace.length,
          currentStateHash: hash(trace[cursor]),
          completedAt: complete ? baseTime : null,
          sourceMode: 'FIXTURE',
        },
        { upsert: true, session },
      );
      if (complete)
        await M.predictionAttempts.replaceOne(
          { _id: seedId('fixture-prediction-' + index) },
          {
            _id: seedId('fixture-prediction-' + index),
            userId: seedId(student),
            topicId: seedId(key),
            sessionId,
            checkpointId: cp._id,
            cursor: checkpointCursor,
            stateHash: hash(trace[checkpointCursor]),
            status: 'ANSWERED',
            responses:
              index === 0
                ? [
                    { choiceId: 'B', correct: false, answeredAt: baseTime },
                    { choiceId: 'A', correct: true, answeredAt: baseTime },
                  ]
                : [{ choiceId: 'B', correct: true, answeredAt: baseTime }],
            firstCorrect: index !== 0,
            sourceMode: 'FIXTURE',
          },
          { upsert: true, session },
        );
    }
    for (const [index, [student, key, kind, reason]] of [
      ['student-a', 'course-2301301-u2-t2', 'CODE', 'PROGRESS'],
      ['student-b', 'course-2301212-u1-t3', 'READ', 'RECURRING'],
    ].entries())
      await M.recommendations.replaceOne(
        { _id: seedId('fixture-recommendation-' + index) },
        {
          _id: seedId('fixture-recommendation-' + index),
          userId: seedId(student),
          topicId: seedId(key),
          activityKind: kind,
          targetId: seedId(key + (kind === 'CODE' ? '-exercise' : '-resource')),
          reasonCode: reason,
          reasonText:
            'SYNTHETIC EXAMPLE: inspect this historical scenario; real evidence starts empty.',
          ruleVersion: 1,
          evidenceIds: [],
          evidenceHash: hash('fixture-' + index),
          status: 'DISMISSED',
          sourceMode: 'FIXTURE',
        },
        { upsert: true, session },
      );
    await M.comparisonRuns.replaceOne(
      { _id: seedId('fixture-comparison') },
      {
        _id: seedId('fixture-comparison'),
        userId: seedId('student-a'),
        topicId: seedId(bubbleKey),
        input: [3, 2, 1],
        arrangement: 'CUSTOM',
        seed: null,
        results: measureComparison([3, 2, 1]),
        idempotencyKey: seedKey('fixture-comparison'),
        requestHash: hash([3, 2, 1]),
      },
      { upsert: true, session },
    );
    await M.auditEvents.updateOne(
      { _id: seedId('seed-audit') },
      {
        $setOnInsert: {
          actorId: seedId('admin'),
          action: 'SYSTEM_RECOMPUTE',
          targetCollection: 'curriculumNodes',
          summary: 'Development curriculum and explicitly synthetic history initialized',
        },
      },
      { upsert: true, session },
    );
  });
}
