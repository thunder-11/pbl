import { z } from 'zod';
import { M, transaction } from './models.js';
import { id, version, sameId, publicDoc, hash } from './utils.js';
import { fail } from './errors.js';
import { scope, audit } from './auth.js';
import { traceAlgorithm, validateInput, algorithms } from './algorithms.js';
export const definitionKinds = [
  'simulations',
  'assessments',
  'questions',
  'codingExercises',
  'predictionCheckpoints',
];
const str = (n) => z.string().min(1).max(n);
const base = {
  topicId: id,
  key: str(80).regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
};
const option = z
  .object({
    optionId: z.enum(['A', 'B', 'C', 'D']),
    text: str(500),
    misconceptionCode: z.string().nullable().optional(),
  })
  .strict();
const test = z
  .object({
    testId: str(40),
    visibility: z.enum(['SAMPLE', 'HIDDEN']),
    stdin: z.string().max(8192),
    expectedStdout: z.string().max(16384),
    misconceptionCode: z.string().nullable().optional(),
  })
  .strict();
const shapes = {
  learningResources: {
    ...base,
    title: str(120),
    content: str(51200),
    referenceUrl: z.url().startsWith('https://').nullable().optional(),
  },
  simulations: {
    ...base,
    title: str(120),
    algorithm: z.enum(algorithms),
    engineVersion: z.literal('1.0.0'),
    defaultInput: z.unknown(),
    enabledCheckpointIds: z.array(id).max(20),
  },
  assessments: {
    ...base,
    title: str(120),
    questionIds: z.array(id).min(5).max(20),
    durationSeconds: z.number().int().min(300).max(3600),
  },
  questions: {
    ...base,
    prompt: str(2000),
    options: z.array(option).length(4),
    correctOptionId: z.enum(['A', 'B', 'C', 'D']),
    explanation: str(2000),
  },
  codingExercises: {
    ...base,
    title: str(120),
    prompt: str(8000),
    starters: z
      .array(
        z
          .object({
            language: z.enum(['C', 'CPP', 'JAVA', 'PYTHON']),
            source: z.string().max(32768),
          })
          .strict(),
      )
      .length(4),
    tests: z.array(test).min(2).max(10),
    limits: z
      .object({
        cpuSeconds: z.number().int().min(1).max(2),
        wallSeconds: z.number().int().min(1).max(5),
        memoryKiB: z.number().int().min(32768).max(131072),
      })
      .strict(),
  },
  predictionCheckpoints: {
    ...base,
    simulationId: id,
    trigger: z.object({ event: str(40), occurrence: z.number().int().min(1).max(10000) }).strict(),
    questionType: z.enum(['MCQ', 'STATE_SELECT']),
    prompt: str(1000),
    choices: z
      .array(
        z
          .object({
            choiceId: z.enum(['A', 'B', 'C', 'D']),
            label: str(500),
            value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    expectedSelector: z.enum(['nextEvent', 'nextArray', 'nextVisited', 'nextIndex']),
    explanation: str(1000),
  },
};
export function parseDefinition(kind, raw) {
  if (!shapes[kind]) fail(404, 'RESOURCE_NOT_FOUND', 'Definition type not found');
  return z.object(shapes[kind]).strict().parse(raw);
}
export function checkpointCursor(cp, trace) {
  let occurrence = 0;
  return trace.findIndex(
    (s) => s.event === cp.trigger.event && ++occurrence === cp.trigger.occurrence,
  );
}
export function expectedPrediction(cp, next, algorithm) {
  if (cp.expectedSelector === 'nextIndex' && algorithm !== 'BINARY_SEARCH')
    fail(422, 'VALIDATION_ERROR', 'Index selector is only supported by Binary Search');
  return cp.expectedSelector === 'nextEvent'
    ? next.event
    : cp.expectedSelector === 'nextArray'
      ? next.array
      : cp.expectedSelector === 'nextVisited'
        ? next.visited
        : next.pointers.low;
}
async function validateDefinition(
  kind,
  body,
  actor,
  { publishing = false, session, documentId } = {},
) {
  if (!(await M.curriculumNodes.exists({ _id: body.topicId, kind: 'TOPIC' })))
    fail(422, 'INVALID_TOPIC_REFERENCE', 'Topic reference is invalid');
  await scope(actor, body.topicId, { topic: true, write: true, published: publishing });
  if (kind === 'learningResources') {
    if (/<\/?[a-z][^>]*>|\]\(\s*(javascript|data):/i.test(body.content))
      fail(422, 'VALIDATION_ERROR', 'Raw HTML and unsafe links are not allowed');
    if (Buffer.byteLength(body.content) > 51200)
      fail(413, 'PAYLOAD_TOO_LARGE', 'Resource is too large');
  }
  if (kind === 'simulations') {
    validateInput(body.algorithm, body.defaultInput);
    if (new Set(body.enabledCheckpointIds).size !== body.enabledCheckpointIds.length)
      fail(422, 'VALIDATION_ERROR', 'Checkpoint references must be unique');
    if (publishing)
      for (const cpId of body.enabledCheckpointIds) {
        let cp = await M.predictionCheckpoints.findById(cpId).session(session);
        if (!cp || !sameId(cp.topicId, body.topicId) || !sameId(cp.simulationId, documentId))
          fail(422, 'TOPIC_MISMATCH', 'Checkpoint must reference this simulation and topic');
        validateCheckpoint(cp, body);
      }
  }
  if (kind === 'questions') {
    if (
      new Set(body.options.map((o) => o.optionId)).size !== 4 ||
      body.options.find((o) => o.optionId === body.correctOptionId)?.misconceptionCode
    )
      fail(422, 'VALIDATION_ERROR', 'Question options or mappings are invalid');
  }
  if (kind === 'assessments') {
    if (new Set(body.questionIds).size !== body.questionIds.length)
      fail(422, 'VALIDATION_ERROR', 'Questions must be unique');
    for (const qId of body.questionIds) {
      const q = await M.questions.findById(qId).session(session);
      if (!q || !sameId(q.topicId, body.topicId))
        fail(422, 'TOPIC_MISMATCH', 'Definition topics do not match');
      if (publishing && q.status !== 'PUBLISHED')
        fail(422, 'VALIDATION_ERROR', 'Assessment questions must be published');
    }
  }
  if (kind === 'codingExercises') {
    if (
      new Set(body.starters.map((s) => s.language)).size !== 4 ||
      new Set(body.tests.map((t) => t.testId)).size !== body.tests.length ||
      !body.tests.some((t) => t.visibility === 'SAMPLE') ||
      !body.tests.some((t) => t.visibility === 'HIDDEN')
    )
      fail(
        422,
        'VALIDATION_ERROR',
        'Four language starters and unique sample/hidden tests are required',
      );
  }
  if (kind === 'predictionCheckpoints') {
    const sim = await M.simulations.findById(body.simulationId).session(session);
    if (!sim || !sameId(sim.topicId, body.topicId))
      fail(422, 'TOPIC_MISMATCH', 'Definition topics do not match');
    validateCheckpoint(body, sim);
    if (
      publishing &&
      (sim.status !== 'PUBLISHED' || !sim.enabledCheckpointIds.some((x) => sameId(x, documentId)))
    )
      fail(422, 'VALIDATION_ERROR', 'Publish the simulation with its enabled checkpoint set');
  }
  const codes =
    kind === 'questions'
      ? body.options.map((o) => o.misconceptionCode).filter(Boolean)
      : kind === 'codingExercises'
        ? body.tests.map((t) => t.misconceptionCode).filter(Boolean)
        : [];
  if (codes.length) {
    const rules = await M.ruleConfigs.findOne({ isActive: true }).session(session);
    if (
      codes.some(
        (code) =>
          !rules?.misconceptions.some((m) => m.code === code && sameId(m.topicId, body.topicId)),
      )
    )
      fail(422, 'VALIDATION_ERROR', 'Misconception must have a same-topic configured mapping');
  }
}
export function validateCheckpoint(cp, sim) {
  const trace = traceAlgorithm(sim.algorithm, sim.defaultInput),
    cursor = checkpointCursor(cp, trace);
  if (
    cursor < 0 ||
    cursor >= trace.length - 1 ||
    new Set(cp.choices.map((c) => c.choiceId)).size !== cp.choices.length
  )
    fail(422, 'VALIDATION_ERROR', 'Checkpoint trigger or choices are invalid');
  const expected = expectedPrediction(cp, trace[cursor + 1], sim.algorithm);
  if (cp.choices.filter((c) => hash({ value: c.value }) === hash({ value: expected })).length !== 1)
    fail(422, 'VALIDATION_ERROR', 'Exactly one candidate must match the next state');
}
export async function createDefinition(kind, raw, actor) {
  const body = parseDefinition(kind, raw);
  let doc = new M[kind]({ ...body, createdBy: actor._id }),
    result;
  await transaction(async (session) => {
    await validateDefinition(kind, body, actor, {
      publishing: body.status === 'PUBLISHED',
      documentId: doc._id,
      session,
    });
    if (body.status === 'PUBLISHED')
      await M[kind].updateMany(
        { key: body.key, status: 'PUBLISHED' },
        { $set: { status: 'ARCHIVED' }, $inc: { recordVersion: 1 } },
        { session },
      );
    await doc.save({ session });
    await audit(actor, 'API-33', kind, doc._id, `Created ${kind} revision`, null, session);
    result = doc;
  });
  return result;
}
export async function mutateDefinition(kind, identifier, raw, actor) {
  if (!shapes[kind]) fail(404, 'RESOURCE_NOT_FOUND', 'Definition type not found');
  const b = z
    .object({
      action: z.enum(['UPDATE', 'PUBLISH', 'ARCHIVE']),
      recordVersion: version,
      definition: z.unknown().optional(),
    })
    .strict()
    .parse(raw);
  const doc = await M[kind].findById(id.parse(identifier));
  if (!doc) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  await scope(actor, doc.topicId, { write: true, topic: true, published: false });
  if (doc.recordVersion !== b.recordVersion)
    fail(409, 'STALE_VERSION', 'Record version has changed');
  if (doc.status === 'PUBLISHED' && b.action === 'UPDATE')
    fail(409, 'PUBLISHED_IMMUTABLE', 'Create a new revision to change published content');
  if (doc.status === 'ARCHIVED' && b.action !== 'ARCHIVE')
    fail(409, 'CONTENT_UNAVAILABLE', 'Archived revisions cannot be republished');
  let body =
    b.action === 'UPDATE'
      ? parseDefinition(kind, b.definition)
      : Object.fromEntries(
          Object.keys(shapes[kind]).map((k) => [k, doc[k]?.toObject ? doc[k].toObject() : doc[k]]),
        );
  if (!sameId(body.topicId, doc.topicId) || body.key !== doc.key || body.version !== doc.version)
    fail(422, 'VALIDATION_ERROR', 'Revision identity cannot change');
  body.status =
    b.action === 'PUBLISH' ? 'PUBLISHED' : b.action === 'ARCHIVE' ? 'ARCHIVED' : body.status;
  if (b.action === 'UPDATE' && body.status !== doc.status)
    fail(422, 'VALIDATION_ERROR', 'Use the Publish or Archive action');
  await transaction(async (session) => {
    await validateDefinition(kind, body, actor, {
      publishing: b.action === 'PUBLISH',
      documentId: doc._id,
      session,
    });
    if (body.status === 'PUBLISHED')
      await M[kind].updateMany(
        { key: doc.key, status: 'PUBLISHED', _id: { $ne: doc._id } },
        { $set: { status: 'ARCHIVED' }, $inc: { recordVersion: 1 } },
        { session },
      );
    const changed = await M[kind].findOneAndUpdate(
      { _id: doc._id, recordVersion: b.recordVersion },
      { $set: body, $inc: { recordVersion: 1 } },
      { session, new: true, runValidators: true },
    );
    if (!changed) fail(409, 'STALE_VERSION', 'Record version has changed');
    if (kind === 'simulations' && b.action === 'PUBLISH')
      for (const cpId of changed.enabledCheckpointIds) {
        const cp = await M.predictionCheckpoints.findById(cpId).session(session);
        await M.predictionCheckpoints.updateMany(
          { key: cp.key, status: 'PUBLISHED', _id: { $ne: cp._id } },
          { $set: { status: 'ARCHIVED' } },
          { session },
        );
        await M.predictionCheckpoints.updateOne(
          { _id: cpId },
          { $set: { status: 'PUBLISHED' }, $inc: { recordVersion: 1 } },
          { session },
        );
      }
    await audit(actor, 'API-34', kind, doc._id, `${b.action} definition revision`, null, session);
  });
  return M[kind].findById(doc._id);
}
const nodeShape = z
  .object({
    kind: z.enum(['YEAR', 'SEMESTER', 'SUBJECT', 'UNIT', 'TOPIC']),
    key: str(80).regex(/^[a-z0-9-]+$/),
    title: str(120),
    parentId: id.nullable(),
    sortOrder: z.number().int().min(0).max(999),
    syllabusLabel: str(120),
    courseCode: z
      .string()
      .regex(/^\d{7}$/)
      .nullable()
      .default(null),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    recordVersion: version.optional(),
  })
  .strict();
export async function mutateNode(raw, actor) {
  const b = z
    .object({
      operation: z.enum(['CREATE', 'UPDATE', 'ARCHIVE']),
      id: id.optional(),
      node: z.unknown().optional(),
      recordVersion: version.optional(),
    })
    .strict()
    .parse(raw);
  let doc = b.id ? await M.curriculumNodes.findById(b.id) : null;
  if (b.operation !== 'CREATE' && !doc) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  const body = b.operation === 'ARCHIVE' ? doc.toObject() : nodeShape.parse(b.node);
  if (b.operation === 'CREATE' && b.id)
    fail(422, 'VALIDATION_ERROR', 'Creation does not accept an identifier');
  if (actor.role === 'FACULTY') {
    if (
      ['YEAR', 'SEMESTER'].includes(body.kind) ||
      (body.kind === 'SUBJECT' && b.operation !== 'UPDATE')
    )
      fail(403, 'ROLE_FORBIDDEN', 'Only administrators manage this curriculum level');
    await scope(actor, doc ? doc._id : body.parentId, { write: true, published: false });
  }
  const expected = ['YEAR', 'SEMESTER', 'SUBJECT', 'UNIT', 'TOPIC'];
  if (body.kind === 'YEAR') {
    if (body.parentId !== null || !['sy', 'ty'].includes(body.key))
      fail(422, 'VALIDATION_ERROR', 'Invalid academic year');
  } else {
    const parent = await M.curriculumNodes.findById(body.parentId);
    if (!parent || expected.indexOf(body.kind) !== expected.indexOf(parent.kind) + 1)
      fail(422, 'INVALID_TOPIC_REFERENCE', 'Curriculum parent is invalid');
    if (body.status === 'PUBLISHED')
      await scope(actor, body.parentId, { published: true, write: true });
  }
  if (
    body.kind === 'SUBJECT' &&
    !['2301212', '2301301', '2311302', '2301303'].includes(body.courseCode)
  )
    fail(422, 'VALIDATION_ERROR', 'Subject is outside the current curriculum scope');
  if (body.kind !== 'SUBJECT' && body.courseCode !== null)
    fail(422, 'VALIDATION_ERROR', 'Only subjects have a course code');
  if (
    doc &&
    ['kind', 'key', 'parentId', 'courseCode'].some((k) => String(doc[k]) !== String(body[k]))
  )
    fail(422, 'VALIDATION_ERROR', 'Curriculum ancestry and identity cannot change');
  if (doc && doc.recordVersion !== (b.recordVersion || body.recordVersion))
    fail(409, 'STALE_VERSION', 'Record version has changed');
  let result;
  await transaction(async (session) => {
    if (b.operation === 'CREATE') {
      const [data] = await M.curriculumNodes.create([{ ...body, createdBy: actor._id }], {
        session,
      });
      result = data;
    } else if (b.operation === 'UPDATE') {
      const fields = { ...body };
      delete fields.recordVersion;
      result = await M.curriculumNodes.findOneAndUpdate(
        { _id: doc._id, recordVersion: b.recordVersion || body.recordVersion },
        { $set: fields, $inc: { recordVersion: 1 } },
        { session, new: true, runValidators: true },
      );
      if (!result) fail(409, 'STALE_VERSION', 'Record version has changed');
    } else {
      const all = await M.curriculumNodes.find().session(session),
        ids = [doc._id];
      for (let i = 0; i < ids.length; i++)
        for (const child of all) if (sameId(child.parentId, ids[i])) ids.push(child._id);
      await M.curriculumNodes.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'ARCHIVED' }, $inc: { recordVersion: 1 } },
        { session },
      );
      for (const kind of ['learningResources', ...definitionKinds])
        await M[kind].updateMany(
          { topicId: { $in: ids } },
          { $set: { status: 'ARCHIVED' }, $inc: { recordVersion: 1 } },
          { session },
        );
      result = await M.curriculumNodes.findById(doc._id).session(session);
    }
    await audit(
      actor,
      'API-08',
      'curriculumNodes',
      result._id,
      `${b.operation} curriculum node`,
      null,
      session,
    );
  });
  return result;
}
export function exercisePublic(d) {
  const v = publicDoc(d);
  const { tests, createdBy, ...rest } = v;
  return {
    ...rest,
    sampleTests: tests
      .filter((t) => t.visibility === 'SAMPLE')
      .map(({ testId, stdin, expectedStdout }) => ({ testId, stdin, expectedStdout })),
  };
}
export function assessmentPublic(d) {
  return {
    id: String(d._id),
    topicId: d.topicId,
    title: d.title,
    version: d.version,
    questionCount: d.questionIds.length,
    durationSeconds: d.durationSeconds,
    status: d.status,
  };
}
export function checkpointPublic(d) {
  const { expectedSelector, explanation, createdBy, ...v } = publicDoc(d);
  return v;
}
