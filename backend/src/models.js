import mongoose from 'mongoose';
const { Schema } = mongoose;
const ref = (required = true) => ({ type: Schema.Types.ObjectId, required });
const text = (max = 120, required = true, extra = {}) => ({
  type: String,
  required,
  maxlength: max,
  ...extra,
});
const integer = (min = 0, max = Number.MAX_SAFE_INTEGER, value) => ({
  type: Number,
  min,
  max,
  validate: Number.isInteger,
  ...(value !== undefined ? { default: value } : {}),
});
const enumField = (values, value, required = true) => ({
  type: String,
  enum: values,
  required,
  ...(value !== undefined ? { default: value } : {}),
});
const nested = (definition) => new Schema(definition, { _id: false, strict: 'throw' });
const status = () => enumField(['DRAFT', 'PUBLISHED', 'ARCHIVED'], 'DRAFT');
const sourceMode = () => enumField(['REAL', 'FIXTURE', 'MOCK'], 'REAL');
const requestFields = { idempotencyKey: text(36), requestHash: text(64) };
const owned = { userId: ref(), topicId: ref() };
const option = nested({
  optionId: enumField(['A', 'B', 'C', 'D']),
  text: text(500),
  misconceptionCode: { type: String, default: null },
});
const test = nested({
  testId: text(40),
  visibility: enumField(['SAMPLE', 'HIDDEN']),
  stdin: { type: String, required: true, default: '', maxlength: 8192 },
  expectedStdout: { type: String, required: true, default: '', maxlength: 16384 },
  misconceptionCode: { type: String, default: null },
});
const answer = nested({ questionId: ref(), optionId: enumField(['A', 'B', 'C', 'D']) });
const snapshot = nested({
  questionId: ref(),
  prompt: text(2000),
  options: [option],
  correctOptionId: enumField(['A', 'B', 'C', 'D']),
  explanation: text(2000),
});
const limits = nested({
  cpuSeconds: integer(1, 2, 2),
  wallSeconds: integer(1, 5, 5),
  memoryKiB: integer(32768, 131072, 131072),
});
const definition = {
  topicId: ref(),
  key: text(80),
  version: integer(1, 100000, 1),
  status: status(),
  createdBy: ref(),
};
const result = nested({
  testId: text(40),
  providerToken: { type: String, default: null },
  dispatchStatus: enumField(['UNSENT', 'SENDING', 'ACCEPTED', 'UNKNOWN'], 'UNSENT'),
  outcome: enumField(
    [
      'PENDING',
      'OK',
      'COMPILE_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT',
      'WRONG_OUTPUT',
      'PROVIDER_ERROR',
    ],
    'PENDING',
  ),
  stdout: { type: String, default: '' },
  stderr: { type: String, default: '' },
  compileOutput: { type: String, default: '' },
  passed: { type: Boolean, default: false },
  pollCount: integer(0, 20, 0),
});
const schemaDefinitions = {
  users: {
    email: text(254, true, { lowercase: true, trim: true }),
    displayName: text(80),
    passwordHash: { ...text(200), select: false },
    role: enumField(['STUDENT', 'FACULTY', 'ADMIN'], 'STUDENT'),
    status: enumField(['ACTIVE', 'DISABLED', 'DELETION_PENDING', 'ANONYMIZED'], 'ACTIVE'),
    academicYear: { type: String, enum: ['SY', 'TY', null], default: null },
    subjectIds: [Schema.Types.ObjectId],
    authVersion: integer(1, 100000, 1),
    deletionRequestedAt: { type: Date, default: null },
  },
  authSessions: {
    userId: ref(),
    tokenHash: text(64),
    csrfHash: text(64),
    familyId: text(36),
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    rotatedToId: { ...ref(false), default: null },
  },
  curriculumNodes: {
    kind: enumField(['YEAR', 'SEMESTER', 'SUBJECT', 'UNIT', 'TOPIC']),
    key: text(80),
    title: text(),
    parentId: { ...ref(false), default: null },
    sortOrder: integer(0, 999, 0),
    status: status(),
    syllabusLabel: text(120, true, { default: 'unverified' }),
    courseCode: { type: String, default: null, match: /^\d{7}$/ },
    createdBy: ref(),
  },
  learningResources: {
    ...definition,
    title: text(),
    content: text(51200),
    referenceUrl: { type: String, default: null },
  },
  simulations: {
    ...definition,
    title: text(),
    algorithm: enumField([
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
    ]),
    engineVersion: { type: String, default: '1.0.0' },
    defaultInput: { type: Schema.Types.Mixed, required: true },
    enabledCheckpointIds: [Schema.Types.ObjectId],
  },
  questions: {
    ...definition,
    prompt: text(2000),
    options: {
      type: [option],
      validate: (v) => v.length === 4 && new Set(v.map((o) => o.optionId)).size === 4,
    },
    correctOptionId: enumField(['A', 'B', 'C', 'D']),
    explanation: text(2000),
  },
  assessments: {
    ...definition,
    title: text(),
    questionIds: {
      type: [Schema.Types.ObjectId],
      validate: (v) => v.length >= 5 && v.length <= 20 && new Set(v.map(String)).size === v.length,
    },
    durationSeconds: integer(300, 3600, 1200),
  },
  codingExercises: {
    ...definition,
    title: text(),
    prompt: text(8000),
    starters: [
      nested({
        language: enumField(['C', 'CPP', 'JAVA', 'PYTHON']),
        source: { type: String, maxlength: 32768, default: '' },
      }),
    ],
    tests: {
      type: [test],
      validate: (v) =>
        v.length >= 2 &&
        v.length <= 10 &&
        new Set(v.map((t) => t.testId)).size === v.length &&
        v.some((t) => t.visibility === 'SAMPLE') &&
        v.some((t) => t.visibility === 'HIDDEN'),
    },
    limits: { type: limits, default: () => ({}) },
  },
  predictionCheckpoints: {
    ...definition,
    simulationId: ref(),
    trigger: { type: nested({ event: text(40), occurrence: integer(1, 10000) }), required: true },
    questionType: enumField(['MCQ', 'STATE_SELECT']),
    prompt: text(1000),
    choices: [
      nested({
        choiceId: enumField(['A', 'B', 'C', 'D']),
        label: text(500),
        value: { type: Schema.Types.Mixed, required: true },
      }),
    ],
    expectedSelector: enumField(['nextEvent', 'nextArray', 'nextVisited', 'nextIndex']),
    explanation: text(1000),
  },
  assessmentAttempts: {
    ...owned,
    ...requestFields,
    assessmentId: ref(),
    status: enumField(['IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'ABANDONED'], 'IN_PROGRESS'),
    questionSnapshot: [snapshot],
    answers: [answer],
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    scorePercent: { type: Number, min: 0, max: 100, default: null },
    sourceMode: sourceMode(),
    finalization: {
      type: nested({ idempotencyKey: text(36), payloadHash: text(64) }),
      default: null,
    },
  },
  codingAttempts: {
    ...owned,
    ...requestFields,
    exerciseId: ref(),
    mode: enumField(['RUN', 'GRADE']),
    language: enumField(['C', 'CPP', 'JAVA', 'PYTHON']),
    sourceCode: text(32768),
    stdin: { type: String, default: '', maxlength: 8192 },
    status: enumField(
      [
        'QUEUED',
        'RUNNING',
        'PASSED',
        'FAILED_TESTS',
        'RUN_SUCCEEDED',
        'COMPILE_ERROR',
        'RUNTIME_ERROR',
        'TIME_LIMIT',
        'SERVICE_ERROR',
        'SERVICE_TIMEOUT',
      ],
      'QUEUED',
    ),
    testSnapshot: [test],
    results: [result],
    nextPollAt: { type: Date, default: null },
    deadlineAt: { type: Date, required: true },
    correct: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
    sourceMode: sourceMode(),
  },
  simulationSessions: {
    ...owned,
    ...requestFields,
    simulationId: ref(),
    input: { type: Schema.Types.Mixed, required: true },
    engineVersion: { type: String, default: '1.0.0' },
    inputHash: text(64),
    status: enumField(['READY', 'PLAYING', 'PAUSED', 'COMPLETED'], 'READY'),
    cursor: integer(0, 10000, 0),
    maxCursor: integer(0, 10000, 0),
    traceLength: integer(1, 10001),
    speed: { type: Number, enum: [0.5, 1, 2, 4], default: 1 },
    currentStateHash: text(64),
    completedAt: { type: Date, default: null },
    sourceMode: sourceMode(),
  },
  predictionAttempts: {
    ...owned,
    sessionId: ref(),
    checkpointId: ref(),
    cursor: integer(0, 10000),
    stateHash: text(64),
    status: enumField(['PENDING', 'ANSWERED', 'SKIPPED'], 'PENDING'),
    responses: [
      nested({
        choiceId: enumField(['A', 'B', 'C', 'D']),
        correct: { type: Boolean, required: true },
        answeredAt: { type: Date, default: Date.now },
      }),
    ],
    firstCorrect: { type: Boolean, default: null },
    sourceMode: sourceMode(),
  },
  topicProgress: {
    ...owned,
    readConfirmations: [nested({ resourceId: ref(), readAt: { type: Date, default: Date.now } })],
    completedCategories: [String],
    availableCategories: [String],
    completionPercent: { type: Number, default: 0 },
    masteryPercent: { type: Number, default: null },
    masteryBand: enumField(['INSUFFICIENT', 'WEAK', 'DEVELOPING', 'MASTERED'], 'INSUFFICIENT'),
    evidenceAt: { type: Date, default: null },
    ruleVersion: integer(1, 100000, 1),
  },
  recommendations: {
    ...owned,
    activityKind: enumField(['READ', 'SIMULATE', 'ASSESS', 'CODE']),
    targetId: ref(),
    reasonCode: enumField([
      'FIRST_USE',
      'INSUFFICIENT',
      'RECURRING',
      'WEAK',
      'PRACTISE',
      'PROGRESS',
    ]),
    reasonText: text(500),
    ruleVersion: integer(1, 100000),
    evidenceIds: [Schema.Types.ObjectId],
    evidenceHash: text(64),
    status: enumField(['ACTIVE', 'DISMISSED', 'COMPLETED', 'SUPERSEDED'], 'ACTIVE'),
    sourceMode: sourceMode(),
  },
  mistakeEvidence: {
    ...owned,
    sourceKind: enumField(['ASSESSMENT', 'CODING']),
    sourceId: ref(),
    itemId: text(60),
    classification: enumField([
      'CONCEPTUAL',
      'COMPILATION',
      'RUNTIME',
      'TEST_FAILURE',
      'UNCLASSIFIED',
    ]),
    misconceptionCode: { type: String, default: null },
  },
  comparisonRuns: {
    ...owned,
    ...requestFields,
    input: [Number],
    arrangement: enumField(['CUSTOM', 'SORTED', 'REVERSE', 'RANDOM', 'DUPLICATES']),
    seed: { type: Number, default: null },
    engineVersion: { type: String, default: '1.0.0' },
    results: [
      nested({
        algorithm: enumField(['BUBBLE_SORT', 'MERGE_SORT']),
        comparisons: integer(0),
        swaps: integer(0),
        mainWrites: integer(0),
        auxiliaryWrites: integer(0),
        visits: integer(0),
        output: [Number],
      }),
    ],
  },
  ruleConfigs: {
    version: integer(1, 100000),
    isActive: { type: Boolean, default: false },
    thresholds: {
      type: nested({
        weakBelow: integer(0, 99, 50),
        masteredAt: integer(1, 100, 80),
        minimumAssessments: integer(2, 3, 2),
        assessmentWindow: integer(3, 3, 3),
        recurrenceAttempts: integer(2, 3, 2),
        misconceptionWindowDays: integer(1, 90, 30),
      }),
      default: () => ({}),
    },
    misconceptions: [
      nested({
        code: text(60),
        label: text(),
        topicId: ref(),
        revisionResourceId: ref(),
        simulationId: { ...ref(false), default: null },
      }),
    ],
    createdBy: ref(),
  },
  auditEvents: {
    actorId: { ...ref(false), default: null },
    action: text(50),
    targetCollection: text(60),
    targetId: { ...ref(false), default: null },
    reason: { type: String, maxlength: 500, default: null },
    summary: text(500),
    expiresAt: { type: Date, default: () => new Date(Date.now() + 365 * 86400000) },
  },
};
export const models = {};
for (const [name, definition] of Object.entries(schemaDefinitions)) {
  const s = new Schema(
    { ...definition, recordVersion: integer(1, Number.MAX_SAFE_INTEGER, 1) },
    { timestamps: true, strict: 'throw', versionKey: false, collection: name },
  );
  if (
    [
      'learningResources',
      'simulations',
      'questions',
      'assessments',
      'codingExercises',
      'predictionCheckpoints',
    ].includes(name)
  ) {
    s.index({ topicId: 1, status: 1 });
    s.index({ key: 1, version: 1 }, { unique: true });
    s.index({ key: 1 }, { unique: true, partialFilterExpression: { status: 'PUBLISHED' } });
  }
  if (
    ['assessmentAttempts', 'codingAttempts', 'simulationSessions', 'comparisonRuns'].includes(name)
  )
    s.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
  if (
    [
      'assessmentAttempts',
      'codingAttempts',
      'simulationSessions',
      'predictionAttempts',
      'mistakeEvidence',
    ].includes(name)
  )
    s.index({ userId: 1, topicId: 1, createdAt: -1, _id: -1 });
  if (
    [
      'assessmentAttempts',
      'codingAttempts',
      'simulationSessions',
      'recommendations',
      'comparisonRuns',
    ].includes(name)
  )
    s.index({ createdAt: 1 });
  models[name] = mongoose.model(name, s);
}
const indexes = {
  users: [
    [{ email: 1 }, { unique: true }],
    [{ role: 1, status: 1 }],
    [{ subjectIds: 1, status: 1 }],
    [{ status: 1, deletionRequestedAt: 1 }],
  ],
  authSessions: [
    [{ tokenHash: 1 }, { unique: true }],
    [{ userId: 1 }],
    [{ familyId: 1 }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
  curriculumNodes: [
    [{ key: 1 }, { unique: true }],
    [{ parentId: 1, sortOrder: 1, _id: 1 }],
    [{ courseCode: 1 }, { unique: true, partialFilterExpression: { kind: 'SUBJECT' } }],
  ],
  assessmentAttempts: [
    [
      { userId: 1, assessmentId: 1 },
      { unique: true, partialFilterExpression: { status: 'IN_PROGRESS' } },
    ],
    [{ status: 1, deadlineAt: 1 }],
    [{ userId: 1, topicId: 1, submittedAt: -1, _id: -1 }],
  ],
  codingAttempts: [[{ status: 1, nextPollAt: 1 }]],
  predictionCheckpoints: [[{ simulationId: 1, status: 1 }]],
  predictionAttempts: [[{ sessionId: 1, checkpointId: 1, cursor: 1 }, { unique: true }]],
  topicProgress: [[{ userId: 1, topicId: 1 }, { unique: true }]],
  recommendations: [
    [{ userId: 1, status: 1, createdAt: -1, _id: -1 }],
    [{ userId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } }],
    [{ userId: 1, evidenceHash: 1, targetId: 1 }, { unique: true }],
  ],
  mistakeEvidence: [[{ sourceKind: 1, sourceId: 1, itemId: 1 }, { unique: true }]],
  comparisonRuns: [[{ userId: 1, createdAt: -1, _id: -1 }]],
  ruleConfigs: [
    [{ version: 1 }, { unique: true }],
    [{ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } }],
  ],
  auditEvents: [
    [{ actorId: 1, createdAt: -1, _id: -1 }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
};
for (const [name, definitions] of Object.entries(indexes))
  for (const [index, options] of definitions) models[name].schema.index(index, options);
export const M = models;
export async function transaction(work) {
  return mongoose.connection.transaction(work);
}
