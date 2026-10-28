import { z } from 'zod';
import { M, transaction } from './models.js';
import { id, uuid, version, hash, publicDoc, sameId, percent } from './utils.js';
import { fail } from './errors.js';
import { scope, own } from './auth.js';
import { traceAlgorithm } from './algorithms.js';
import { checkpointCursor, expectedPrediction } from './content.js';
import { learningData, recomputeRecommendation } from './progress.js';
async function replay(model, actor, b) {
  const existing = await model.findOne({ userId: actor._id, idempotencyKey: b.idempotencyKey });
  if (existing && existing.requestHash !== hash({ ...b, idempotencyKey: undefined }))
    fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another payload');
  return existing;
}
async function refresh(actor) {
  if (actor.status === 'ACTIVE') await recomputeRecommendation(actor, await learningData(actor));
}
export async function startSimulation(actor, raw) {
  const b = z
      .object({ simulationId: id, input: z.unknown(), idempotencyKey: uuid })
      .strict()
      .parse(raw),
    existing = await replay(M.simulationSessions, actor, b);
  if (existing) return { doc: existing, status: 200 };
  let sim = await M.simulations.findById(b.simulationId);
  if (!sim) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  if (sim.status !== 'PUBLISHED')
    fail(409, 'CONTENT_UNAVAILABLE', 'Content is unavailable for new activity');
  await scope(actor, sim.topicId, { topic: true });
  let trace = traceAlgorithm(sim.algorithm, b.input);
  const doc = await M.simulationSessions.create({
    userId: actor._id,
    topicId: sim.topicId,
    ...b,
    requestHash: hash({ ...b, idempotencyKey: undefined }),
    inputHash: hash(b.input),
    engineVersion: sim.engineVersion,
    traceLength: trace.length,
    currentStateHash: hash(trace[0]),
  });
  return { doc, status: 201 };
}
async function predictionFor(session, sim, trace, { create = false } = {}) {
  if (session.inputHash !== hash(sim.defaultInput)) return null;
  for (const cpId of sim.enabledCheckpointIds) {
    const cp = await M.predictionCheckpoints.findOne({ _id: cpId, status: 'PUBLISHED' });
    if (!cp || checkpointCursor(cp, trace) !== session.cursor) continue;
    const next = trace[session.cursor + 1];
    if (
      !next ||
      cp.choices.filter(
        (c) =>
          hash({ value: c.value }) === hash({ value: expectedPrediction(cp, next, sim.algorithm) }),
      ).length !== 1
    )
      continue;
    const filter = { sessionId: session._id, checkpointId: cp._id, cursor: session.cursor };
    if (create)
      return M.predictionAttempts.findOneAndUpdate(
        filter,
        {
          $setOnInsert: {
            ...filter,
            userId: session.userId,
            topicId: session.topicId,
            stateHash: session.currentStateHash,
            sourceMode: session.sourceMode,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    return M.predictionAttempts.findOne(filter);
  }
  return null;
}
export async function simulationPublic(doc) {
  const sim = await M.simulations.findById(doc.simulationId),
    trace = traceAlgorithm(sim.algorithm, doc.input),
    pending = await predictionFor(doc, sim, trace),
    v = publicDoc(doc);
  delete v.requestHash;
  delete v.idempotencyKey;
  delete v.userId;
  return {
    ...v,
    state: trace[doc.cursor],
    pendingPredictionId: pending?.status === 'PENDING' ? pending._id : null,
    predictionId: pending?._id || null,
    checkpointId: pending?.checkpointId || null,
    predictionAvailability:
      sim.enabledCheckpointIds.length && doc.inputHash !== hash(sim.defaultInput)
        ? 'DEFAULT_INPUT_ONLY'
        : 'AVAILABLE',
  };
}
export async function controlSimulation(actor, identifier, raw) {
  const b = z
      .object({
        command: z.enum(['SYNC', 'PLAY', 'PAUSE', 'NEXT', 'PREVIOUS', 'RESET', 'SPEED']),
        recordVersion: version.optional(),
        speed: z.number().optional(),
      })
      .strict()
      .parse(raw),
    doc = await own(M.simulationSessions, identifier, actor);
  if (b.command === 'SYNC') return simulationPublic(doc);
  await scope(actor, doc.topicId, { topic: true });
  if (doc.recordVersion !== b.recordVersion)
    fail(409, 'STALE_VERSION', 'Record version has changed');
  const sim = await M.simulations.findById(doc.simulationId),
    trace = traceAlgorithm(sim.algorithm, doc.input),
    pending = await predictionFor(doc, sim, trace);
  if (['NEXT', 'PLAY'].includes(b.command) && pending?.status === 'PENDING')
    fail(409, 'PREDICTION_PENDING', 'Answer or skip the pending prediction');
  const fields = {};
  if (b.command === 'PLAY') {
    if (doc.cursor === trace.length - 1)
      fail(409, 'INVALID_TRANSITION', 'Reset or move back before playing');
    fields.status = 'PLAYING';
  }
  if (b.command === 'PAUSE') {
    if (doc.status === 'COMPLETED') fail(409, 'INVALID_TRANSITION', 'Simulation is complete');
    fields.status = 'PAUSED';
  }
  if (b.command === 'SPEED') {
    if (![0.5, 1, 2, 4].includes(b.speed))
      fail(422, 'VALIDATION_ERROR', 'Select a supported speed');
    fields.speed = b.speed;
  }
  if (b.command === 'NEXT' || b.command === 'PREVIOUS') {
    const cursor = doc.cursor + (b.command === 'NEXT' ? 1 : -1);
    if (cursor < 0 || cursor >= trace.length)
      fail(409, 'INVALID_TRANSITION', 'No state in that direction');
    if (b.command === 'PREVIOUS' && pending?.status === 'PENDING')
      await M.predictionAttempts.updateOne(
        { _id: pending._id, status: 'PENDING' },
        { $set: { status: 'SKIPPED' }, $inc: { recordVersion: 1 } },
      );
    fields.cursor = cursor;
    fields.maxCursor = Math.max(doc.maxCursor, cursor);
    fields.currentStateHash = hash(trace[cursor]);
    fields.status = trace[cursor].done
      ? 'COMPLETED'
      : doc.status === 'PLAYING' && b.command === 'NEXT'
        ? 'PLAYING'
        : 'PAUSED';
    if (trace[cursor].done) fields.completedAt = doc.completedAt || new Date();
  }
  if (b.command === 'RESET') {
    await M.predictionAttempts.updateMany(
      { sessionId: doc._id, status: 'PENDING' },
      { $set: { status: 'SKIPPED' }, $inc: { recordVersion: 1 } },
    );
    Object.assign(fields, { cursor: 0, currentStateHash: hash(trace[0]), status: 'READY' });
  }
  let changed = await M.simulationSessions.findOneAndUpdate(
    { _id: doc._id, userId: actor._id, recordVersion: b.recordVersion },
    { $set: fields, $inc: { recordVersion: 1 } },
    { new: true, runValidators: true },
  );
  if (!changed) fail(409, 'STALE_VERSION', 'Record version has changed');
  const arrived = await predictionFor(changed, sim, trace, { create: true });
  if (arrived?.status === 'PENDING' && changed.status === 'PLAYING') {
    changed.status = 'PAUSED';
    await changed.save();
  }
  if (!doc.completedAt && changed.completedAt && doc.sourceMode === 'REAL') await refresh(actor);
  return simulationPublic(changed);
}
export async function predictionPublic(doc) {
  const cp = await M.predictionCheckpoints.findById(doc.checkpointId),
    v = publicDoc(doc);
  delete v.userId;
  if (doc.status !== 'PENDING') {
    const s = await M.simulationSessions.findById(doc.sessionId),
      sim = await M.simulations.findById(s.simulationId),
      trace = traceAlgorithm(sim.algorithm, s.input);
    v.feedback = {
      expectedValue: expectedPrediction(cp, trace[doc.cursor + 1], sim.algorithm),
      explanation: cp.explanation,
    };
  }
  return v;
}
export async function openPrediction(actor, raw) {
  const b = z
      .object({
        sessionId: id,
        checkpointId: id,
        cursor: z.number().int().nonnegative(),
        stateHash: z.string().length(64),
      })
      .strict()
      .parse(raw),
    session = await own(M.simulationSessions, b.sessionId, actor),
    sim = await M.simulations.findById(session.simulationId),
    trace = traceAlgorithm(sim.algorithm, session.input);
  if (session.cursor !== b.cursor || session.currentStateHash !== b.stateHash)
    fail(409, 'WRONG_SIMULATION_STATE', 'Prediction does not match the current simulation state');
  const attempt = await predictionFor(session, sim, trace, { create: true });
  if (!attempt || !sameId(attempt.checkpointId, b.checkpointId))
    fail(409, 'WRONG_SIMULATION_STATE', 'Checkpoint is not available for this state/input');
  if (session.status === 'PLAYING') {
    session.status = 'PAUSED';
    session.recordVersion++;
    await session.save();
  }
  return predictionPublic(attempt);
}
export async function answerPrediction(actor, identifier, raw) {
  const b = z
      .object({
        action: z.enum(['ANSWER', 'SKIP']),
        choiceId: z.string().optional(),
        cursor: z.number().int().nonnegative(),
        stateHash: z.string().length(64),
        recordVersion: version,
      })
      .strict()
      .parse(raw),
    doc = await own(M.predictionAttempts, identifier, actor),
    session = await own(M.simulationSessions, String(doc.sessionId), actor);
  if (
    doc.cursor !== b.cursor ||
    doc.stateHash !== b.stateHash ||
    session.cursor !== b.cursor ||
    session.currentStateHash !== b.stateHash
  )
    fail(409, 'WRONG_SIMULATION_STATE', 'Prediction does not match the current simulation state');
  if (doc.responses.length >= 2) fail(409, 'RETRY_LIMIT', 'Prediction retry limit reached');
  if (doc.recordVersion !== b.recordVersion)
    fail(409, 'STALE_VERSION', 'Record version has changed');
  if (doc.status === 'SKIPPED' || (b.action === 'SKIP' && doc.status !== 'PENDING'))
    fail(409, 'INVALID_TRANSITION', 'State transition is not allowed');
  const cp = await M.predictionCheckpoints.findById(doc.checkpointId);
  let update;
  if (b.action === 'SKIP') {
    if (b.choiceId !== undefined) fail(422, 'VALIDATION_ERROR', 'Skip does not accept a choice');
    update = { $set: { status: 'SKIPPED' } };
  } else {
    const choice = cp.choices.find((c) => c.choiceId === b.choiceId);
    if (!choice) fail(422, 'INVALID_PREDICTION', 'Prediction choice is invalid');
    const sim = await M.simulations.findById(session.simulationId),
      trace = traceAlgorithm(sim.algorithm, session.input),
      correct =
        hash({ value: choice.value }) ===
        hash({ value: expectedPrediction(cp, trace[doc.cursor + 1], sim.algorithm) });
    update = {
      $set: { status: 'ANSWERED', ...(doc.responses.length ? {} : { firstCorrect: correct }) },
      $push: { responses: { choiceId: choice.choiceId, correct, answeredAt: new Date() } },
    };
  }
  update.$inc = { recordVersion: 1 };
  const changed = await M.predictionAttempts.findOneAndUpdate(
    { _id: doc._id, recordVersion: b.recordVersion },
    update,
    { new: true, runValidators: true },
  );
  if (!changed) fail(409, 'STALE_VERSION', 'Record version has changed');
  return predictionPublic(changed);
}
export function assessmentAttemptPublic(doc) {
  const v = publicDoc(doc);
  const finalized = ['SUBMITTED', 'EXPIRED'].includes(doc.status);
  return {
    id: v.id,
    sourceMode: v.sourceMode,
    topicId: v.topicId,
    assessmentId: v.assessmentId,
    status: v.status,
    deadlineAt: v.deadlineAt,
    questions: v.questionSnapshot.map((q) => ({
      questionId: q.questionId,
      prompt: q.prompt,
      options: q.options.map((o) => ({ optionId: o.optionId, text: o.text })),
      ...(finalized ? { correctOptionId: q.correctOptionId, explanation: q.explanation } : {}),
    })),
    answers: v.answers,
    submittedAt: v.submittedAt,
    scorePercent: v.scorePercent,
    recordVersion: v.recordVersion,
  };
}
export async function startAssessment(actor, raw) {
  const b = z.object({ assessmentId: id, idempotencyKey: uuid }).strict().parse(raw),
    existing = await replay(M.assessmentAttempts, actor, b);
  if (existing) return { doc: existing, status: 200 };
  const assessment = await M.assessments.findById(b.assessmentId);
  if (!assessment) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  if (assessment.status !== 'PUBLISHED')
    fail(409, 'CONTENT_UNAVAILABLE', 'Content is unavailable for new activity');
  await scope(actor, assessment.topicId, { topic: true });
  await expireAssessments();
  const questions = await M.questions.find({ _id: { $in: assessment.questionIds } });
  let result;
  await transaction(async (session) => {
    await M.users.updateOne({ _id: actor._id }, { $inc: { recordVersion: 1 } }, { session });
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    if (
      (await M.assessmentAttempts
        .countDocuments({
          userId: actor._id,
          topicId: assessment.topicId,
          createdAt: { $gte: midnight },
          sourceMode: 'REAL',
        })
        .session(session)) >= 5
    )
      fail(429, 'RATE_LIMITED', 'Assessment start limit reached');
    if (
      await M.assessmentAttempts
        .exists({ userId: actor._id, assessmentId: assessment._id, status: 'IN_PROGRESS' })
        .session(session)
    )
      fail(409, 'ATTEMPT_OPEN', 'An assessment attempt is already open');
    const [doc] = await M.assessmentAttempts.create(
      [
        {
          ...b,
          userId: actor._id,
          topicId: assessment.topicId,
          requestHash: hash({ ...b, idempotencyKey: undefined }),
          deadlineAt: new Date(Date.now() + assessment.durationSeconds * 1000),
          questionSnapshot: assessment.questionIds.map((qId) => {
            const q = questions.find((v) => sameId(v._id, qId));
            return {
              questionId: q._id,
              prompt: q.prompt,
              options: q.options.map((o) => o.toObject()),
              correctOptionId: q.correctOptionId,
              explanation: q.explanation,
            };
          }),
          answers: [],
        },
      ],
      { session },
    );
    result = doc;
  });
  return { doc: result, status: 201 };
}
async function expire(doc) {
  if (doc.status !== 'IN_PROGRESS' || doc.deadlineAt > new Date()) return false;
  const correct = doc.answers.filter(
    (a) =>
      doc.questionSnapshot.find((q) => sameId(q.questionId, a.questionId))?.correctOptionId ===
      a.optionId,
  ).length;
  await M.assessmentAttempts.updateOne(
    { _id: doc._id, status: 'IN_PROGRESS' },
    {
      $set: {
        status: 'EXPIRED',
        submittedAt: new Date(),
        scorePercent: percent(correct, doc.questionSnapshot.length),
      },
      $inc: { recordVersion: 1 },
    },
  );
  return true;
}
export async function expireAssessments() {
  const rows = await M.assessmentAttempts
    .find({ status: 'IN_PROGRESS', deadlineAt: { $lte: new Date() } })
    .limit(100);
  for (const a of rows) await expire(a);
}
export async function saveAnswers(actor, identifier, raw) {
  const b = z
      .object({
        recordVersion: version,
        answers: z
          .array(z.object({ questionId: id, optionId: z.string() }).strict())
          .min(1)
          .max(20),
      })
      .strict()
      .parse(raw),
    doc = await own(M.assessmentAttempts, identifier, actor);
  if ((await expire(doc)) || doc.status === 'EXPIRED')
    fail(409, 'ATTEMPT_EXPIRED', 'Assessment deadline has passed');
  if (doc.status !== 'IN_PROGRESS') fail(409, 'ALREADY_FINALIZED', 'Attempt was already finalized');
  if (new Set(b.answers.map((a) => a.questionId)).size !== b.answers.length)
    fail(422, 'INVALID_ANSWER', 'Answer is not a snapshot question option');
  for (const a of b.answers) {
    const q = doc.questionSnapshot.find((q) => sameId(q.questionId, a.questionId));
    if (!q || !q.options.some((o) => o.optionId === a.optionId))
      fail(422, 'INVALID_ANSWER', 'Answer is not a snapshot question option');
  }
  let answers = doc.answers.map((a) => a.toObject());
  for (const a of b.answers) {
    let index = answers.findIndex((v) => sameId(v.questionId, a.questionId));
    if (index < 0) answers.push(a);
    else answers[index] = a;
  }
  const updated = await M.assessmentAttempts.findOneAndUpdate(
    { _id: doc._id, recordVersion: b.recordVersion, status: 'IN_PROGRESS' },
    { $set: { answers }, $inc: { recordVersion: 1 } },
    { new: true, runValidators: true },
  );
  if (!updated) fail(409, 'STALE_VERSION', 'Record version has changed');
  return assessmentAttemptPublic(updated);
}
export async function finalizeAssessment(actor, identifier, raw) {
  if (raw?.action === 'SYNC') {
    z.object({ action: z.literal('SYNC') })
      .strict()
      .parse(raw);
    const doc = await own(M.assessmentAttempts, identifier, actor);
    if (await expire(doc))
      return assessmentAttemptPublic(await M.assessmentAttempts.findById(doc._id));
    return assessmentAttemptPublic(doc);
  }
  const b = z
      .object({
        action: z.enum(['SUBMIT', 'ABANDON']),
        recordVersion: version,
        idempotencyKey: uuid,
      })
      .strict()
      .parse(raw),
    doc = await own(M.assessmentAttempts, identifier, actor),
    payloadHash = hash({ action: b.action });
  if (doc.finalization?.idempotencyKey === b.idempotencyKey) {
    if (doc.finalization.payloadHash !== payloadHash)
      fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another payload');
    return assessmentAttemptPublic(doc);
  }
  if ((await expire(doc)) || doc.status === 'EXPIRED')
    fail(409, 'ATTEMPT_EXPIRED', 'Assessment deadline has passed');
  if (doc.status !== 'IN_PROGRESS')
    fail(
      409,
      doc.status === 'SUBMITTED' ? 'ALREADY_SUBMITTED' : 'ALREADY_FINALIZED',
      'Assessment was already finalized',
    );
  if (b.action === 'SUBMIT' && doc.answers.length !== doc.questionSnapshot.length)
    fail(422, 'INCOMPLETE_ASSESSMENT', 'Answer every assessment question');
  let result;
  await transaction(async (session) => {
    const correct = doc.answers.filter(
      (a) =>
        doc.questionSnapshot.find((q) => sameId(q.questionId, a.questionId))?.correctOptionId ===
        a.optionId,
    ).length;
    result = await M.assessmentAttempts.findOneAndUpdate(
      { _id: doc._id, status: 'IN_PROGRESS', recordVersion: b.recordVersion },
      {
        $set: {
          status: b.action === 'SUBMIT' ? 'SUBMITTED' : 'ABANDONED',
          scorePercent:
            b.action === 'SUBMIT' ? percent(correct, doc.questionSnapshot.length) : null,
          submittedAt: b.action === 'SUBMIT' ? new Date() : null,
          finalization: { idempotencyKey: b.idempotencyKey, payloadHash },
        },
        $inc: { recordVersion: 1 },
      },
      { new: true, session },
    );
    if (!result) fail(409, 'STALE_VERSION', 'Record version has changed');
    if (b.action === 'SUBMIT' && doc.sourceMode === 'REAL')
      for (const a of doc.answers) {
        const q = doc.questionSnapshot.find((q) => sameId(q.questionId, a.questionId));
        if (q.correctOptionId === a.optionId) continue;
        const code = q.options.find((o) => o.optionId === a.optionId)?.misconceptionCode;
        await M.mistakeEvidence.updateOne(
          { sourceKind: 'ASSESSMENT', sourceId: doc._id, itemId: String(q.questionId) },
          {
            $setOnInsert: {
              userId: actor._id,
              topicId: doc.topicId,
              classification: code ? 'CONCEPTUAL' : 'UNCLASSIFIED',
              misconceptionCode: code || null,
            },
          },
          { upsert: true, session },
        );
      }
  });
  await refresh(actor);
  return assessmentAttemptPublic(result);
}
