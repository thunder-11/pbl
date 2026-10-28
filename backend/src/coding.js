import { z } from 'zod';
import { M, transaction } from './models.js';
import { config } from './config.js';
import { id, uuid, hash, normalizeOutput, publicDoc } from './utils.js';
import { fail } from './errors.js';
import { scope, own } from './auth.js';
import { learningData, recomputeRecommendation } from './progress.js';
const terminal = [
  'PASSED',
  'FAILED_TESTS',
  'RUN_SUCCEEDED',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
  'SERVICE_ERROR',
  'SERVICE_TIMEOUT',
];
const languages = ['C', 'CPP', 'JAVA', 'PYTHON'];
let providerHealthy = true,
  busy = false;
export function executionMode() {
  return config.executionMode === 'MOCK'
    ? 'MOCK'
    : config.executionMode === 'REAL' &&
        config.providerVerified &&
        config.providerUrl?.startsWith('https://') &&
        providerHealthy &&
        languages.every(
          (l) =>
            Number.isInteger(Number(process.env['JUDGE0_LANGUAGE_' + l])) &&
            Number(process.env['JUDGE0_LANGUAGE_' + l]) > 0,
        )
      ? 'REAL'
      : 'UNAVAILABLE';
}
export function codingPublic(doc, { includeSource = false } = {}) {
  const v = publicDoc(doc);
  return {
    id: v.id,
    topicId: v.topicId,
    exerciseId: v.exerciseId,
    mode: v.mode,
    language: v.language,
    status: v.status,
    sourceMode: v.sourceMode,
    correct: v.correct,
    finishedAt: v.finishedAt,
    recordVersion: v.recordVersion,
    ...(includeSource ? { sourceCode: v.sourceCode, stdin: v.stdin } : {}),
    results: v.results.map((r) => {
      const test = v.testSnapshot.find((t) => t.testId === r.testId),
        visibility = test?.visibility || 'CUSTOM',
        base = { testId: r.testId, visibility, outcome: r.outcome, passed: r.passed };
      return visibility === 'HIDDEN'
        ? base
        : {
            ...base,
            stdout: r.stdout,
            stderr: r.stderr,
            compileOutput: r.compileOutput,
            ...(test ? { expectedStdout: test.expectedStdout, actualStdout: r.stdout } : {}),
          };
    }),
  };
}
export async function createCoding(actor, raw) {
  const b = z
    .object({
      exerciseId: id,
      language: z.string(),
      mode: z.enum(['RUN', 'GRADE']),
      sourceCode: z.string().min(1),
      stdin: z.string().optional(),
      idempotencyKey: uuid,
    })
    .strict()
    .parse(raw);
  if (!languages.includes(b.language))
    fail(422, 'UNSUPPORTED_LANGUAGE', 'Language is not supported');
  if (Buffer.byteLength(b.sourceCode) > 32768 || Buffer.byteLength(b.stdin || '') > 8192)
    fail(413, 'PAYLOAD_TOO_LARGE', 'Source or input exceeds its size limit');
  if (b.mode === 'GRADE' && b.stdin !== undefined)
    fail(422, 'VALIDATION_ERROR', 'Custom stdin is forbidden for grading');
  let requestHash = hash({ ...b, idempotencyKey: undefined }),
    existing = await M.codingAttempts.findOne({
      userId: actor._id,
      idempotencyKey: b.idempotencyKey,
    });
  if (existing) {
    if (existing.requestHash !== requestHash)
      fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another payload');
    return { attempt: existing, status: 200 };
  }
  const exercise = await M.codingExercises.findById(b.exerciseId);
  if (!exercise) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  if (exercise.status !== 'PUBLISHED')
    fail(409, 'CONTENT_UNAVAILABLE', 'Content is unavailable for new activity');
  await scope(actor, exercise.topicId, { topic: true });
  const mode = executionMode();
  if (mode === 'UNAVAILABLE')
    fail(503, 'EXECUTION_UNAVAILABLE', 'Real code execution is unavailable');
  if (mode === 'MOCK' && b.mode === 'GRADE')
    fail(503, 'REAL_GRADING_REQUIRED', 'Grading requires real external execution');
  let result;
  await transaction(async (session) => {
    await M.users.updateOne({ _id: actor._id }, { $inc: { recordVersion: 1 } }, { session });
    const active = await M.codingAttempts
        .countDocuments({ userId: actor._id, status: { $in: ['QUEUED', 'RUNNING'] } })
        .session(session),
      hour = await M.codingAttempts
        .countDocuments({
          userId: actor._id,
          sourceMode: { $ne: 'FIXTURE' },
          createdAt: { $gte: new Date(Date.now() - 3600000) },
        })
        .session(session);
    if (active >= 2 || hour >= 20)
      fail(429, 'RATE_LIMITED', 'Execution concurrency or hourly budget exceeded');
    let testSnapshot = b.mode === 'GRADE' ? exercise.tests.map((t) => t.toObject()) : [];
    const [doc] = await M.codingAttempts.create(
      [
        {
          ...b,
          userId: actor._id,
          topicId: exercise.topicId,
          requestHash,
          testSnapshot,
          results:
            b.mode === 'RUN'
              ? [{ testId: 'custom' }]
              : testSnapshot.map((t) => ({ testId: t.testId })),
          deadlineAt: new Date(Date.now() + 60000),
          status: mode === 'MOCK' ? 'RUN_SUCCEEDED' : 'QUEUED',
          sourceMode: mode === 'MOCK' ? 'MOCK' : 'REAL',
          correct: false,
          ...(mode === 'MOCK'
            ? {
                finishedAt: new Date(),
                results: [
                  {
                    testId: 'custom',
                    outcome: 'OK',
                    stdout: 'MOCK: code was not compiled or executed',
                    passed: false,
                  },
                ],
              }
            : {}),
        },
      ],
      { session },
    );
    result = doc;
  });
  return { attempt: result, status: mode === 'MOCK' ? 200 : 202 };
}
function headers() {
  return {
    'Content-Type': 'application/json',
    ...(config.providerKey ? { [config.providerHeader]: config.providerKey } : {}),
  };
}
async function providerRequest(path, options = {}) {
  const response = await fetch(`${config.providerUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: headers(),
    signal: AbortSignal.timeout(options.method === 'POST' ? 5000 : 3000),
  });
  if ([401, 403, 429].includes(response.status)) providerHealthy = false;
  if (!response.ok) throw Error('Provider rejected request');
  return response.json();
}
const decode = (value) => (value ? Buffer.from(value, 'base64').toString('utf8') : '');
async function finish(attempt, status) {
  const result = await M.codingAttempts.findOneAndUpdate(
    { _id: attempt._id, status: { $in: ['QUEUED', 'RUNNING'] } },
    {
      $set: {
        status,
        correct: status === 'PASSED' && attempt.mode === 'GRADE' && attempt.sourceMode === 'REAL',
        finishedAt: new Date(),
        nextPollAt: null,
      },
      $inc: { recordVersion: 1 },
    },
    { new: true },
  );
  if (!result) return;
  const user = await M.users.findById(attempt.userId);
  if (!user || user.status !== 'ACTIVE') return;
  if (!['SERVICE_ERROR', 'SERVICE_TIMEOUT', 'RUN_SUCCEEDED', 'PASSED'].includes(status)) {
    if (['COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT'].includes(status))
      await M.mistakeEvidence.updateOne(
        { sourceKind: 'CODING', sourceId: attempt._id, itemId: 'diagnostic' },
        {
          $setOnInsert: {
            userId: attempt.userId,
            topicId: attempt.topicId,
            classification: status === 'COMPILE_ERROR' ? 'COMPILATION' : 'RUNTIME',
          },
        },
        { upsert: true },
      );
    else
      for (const r of attempt.results.filter((r) => r.outcome === 'WRONG_OUTPUT')) {
        const t = attempt.testSnapshot.find((t) => t.testId === r.testId);
        await M.mistakeEvidence.updateOne(
          { sourceKind: 'CODING', sourceId: attempt._id, itemId: r.testId },
          {
            $setOnInsert: {
              userId: attempt.userId,
              topicId: attempt.topicId,
              classification: t?.misconceptionCode ? 'CONCEPTUAL' : 'TEST_FAILURE',
              misconceptionCode: t?.misconceptionCode || null,
            },
          },
          { upsert: true },
        );
      }
  }
  await recomputeRecommendation(user, await learningData(user));
}
export async function processCodingJobs() {
  if (busy) return;
  busy = true;
  try {
    let attempts = await M.codingAttempts
      .find({ sourceMode: 'REAL', status: { $in: ['QUEUED', 'RUNNING'] } })
      .sort({ createdAt: 1 })
      .limit(20);
    for (const attempt of attempts) {
      if (attempt.deadlineAt <= new Date()) {
        await finish(attempt, 'SERVICE_TIMEOUT');
        continue;
      }
      if (attempt.nextPollAt && attempt.nextPollAt > new Date()) continue;
      let index = attempt.results.findIndex((r) => r.outcome === 'PENDING');
      if (index < 0) {
        await finish(
          attempt,
          attempt.mode === 'RUN'
            ? 'RUN_SUCCEEDED'
            : attempt.results.every((r) => r.passed)
              ? 'PASSED'
              : 'FAILED_TESTS',
        );
        continue;
      }
      let result = attempt.results[index];
      try {
        if (
          result.dispatchStatus === 'UNKNOWN' ||
          (result.dispatchStatus === 'SENDING' && !result.providerToken)
        ) {
          await finish(attempt, 'SERVICE_ERROR');
          continue;
        }
        if (result.dispatchStatus === 'UNSENT') {
          const claim = await M.codingAttempts.updateOne(
            {
              _id: attempt._id,
              status: { $in: ['QUEUED', 'RUNNING'] },
              [`results.${index}.dispatchStatus`]: 'UNSENT',
            },
            { $set: { [`results.${index}.dispatchStatus`]: 'SENDING' } },
          );
          if (!claim.modifiedCount) continue;
          const test = attempt.testSnapshot.find((t) => t.testId === result.testId);
          const response = await providerRequest('/submissions?base64_encoded=true&wait=false', {
            method: 'POST',
            body: JSON.stringify({
              language_id: Number(process.env['JUDGE0_LANGUAGE_' + attempt.language]),
              source_code: Buffer.from(attempt.sourceCode).toString('base64'),
              stdin: Buffer.from(test?.stdin ?? attempt.stdin).toString('base64'),
              enable_network: false,
              cpu_time_limit: 2,
              wall_time_limit: 5,
              memory_limit: 131072,
              max_file_size: 16,
              number_of_runs: 1,
            }),
          });
          if (typeof response.token !== 'string') throw Error('Missing provider token');
          await M.codingAttempts.updateOne(
            { _id: attempt._id, status: { $in: ['QUEUED', 'RUNNING'] } },
            {
              $set: {
                status: 'RUNNING',
                [`results.${index}.providerToken`]: response.token,
                [`results.${index}.dispatchStatus`]: 'ACCEPTED',
                nextPollAt: new Date(Date.now() + 2000),
              },
            },
          );
          continue;
        }
        if (result.pollCount >= 20) {
          await finish(attempt, 'SERVICE_TIMEOUT');
          continue;
        }
        let response;
        for (let retry = 0; retry < 2; retry++) {
          try {
            response = await providerRequest(
              `/submissions/${encodeURIComponent(result.providerToken)}?base64_encoded=true&fields=status,stdout,stderr,compile_output`,
            );
            break;
          } catch (error) {
            if (retry) throw error;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
        result.pollCount++;
        const statusId = response.status?.id;
        if (!Number.isInteger(statusId)) throw Error('Invalid provider result');
        if ([1, 2].includes(statusId)) {
          attempt.nextPollAt = new Date(Date.now() + 2000);
          await attempt.save();
          continue;
        }
        result.stdout = decode(response.stdout);
        result.stderr = decode(response.stderr);
        result.compileOutput = decode(response.compile_output);
        const oversized = [result.stdout, result.stderr, result.compileOutput].some(
          (s) => Buffer.byteLength(s) > 16384,
        );
        for (const key of ['stdout', 'stderr', 'compileOutput'])
          if (Buffer.byteLength(result[key]) > 16384)
            result[key] =
              Buffer.from(result[key]).subarray(0, 16384).toString('utf8') + '\n[truncated]';
        if (oversized) {
          result.outcome = 'RUNTIME_ERROR';
          result.stderr = 'Output limit exceeded';
        } else
          result.outcome =
            statusId === 3
              ? 'OK'
              : statusId === 4
                ? 'WRONG_OUTPUT'
                : statusId === 5
                  ? 'TIME_LIMIT'
                  : statusId === 6
                    ? 'COMPILE_ERROR'
                    : statusId >= 7 && statusId <= 12
                      ? 'RUNTIME_ERROR'
                      : 'PROVIDER_ERROR';
        if (result.outcome === 'OK' && attempt.mode === 'GRADE') {
          const test = attempt.testSnapshot.find((t) => t.testId === result.testId);
          result.passed = normalizeOutput(result.stdout) === normalizeOutput(test.expectedStdout);
          if (!result.passed) result.outcome = 'WRONG_OUTPUT';
        }
        await attempt.save();
        if (['COMPILE_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT'].includes(result.outcome))
          await finish(attempt, result.outcome);
        else if (result.outcome === 'PROVIDER_ERROR') await finish(attempt, 'SERVICE_ERROR');
        else if (attempt.results.every((r) => r.outcome !== 'PENDING'))
          await finish(
            attempt,
            attempt.mode === 'RUN'
              ? 'RUN_SUCCEEDED'
              : attempt.results.every((r) => r.passed)
                ? 'PASSED'
                : 'FAILED_TESTS',
          );
      } catch {
        await M.codingAttempts.updateOne(
          { _id: attempt._id, [`results.${index}.dispatchStatus`]: 'SENDING' },
          { $set: { [`results.${index}.dispatchStatus`]: 'UNKNOWN' } },
        );
        await finish(attempt, 'SERVICE_ERROR');
      }
    }
  } finally {
    busy = false;
  }
}
export async function getCoding(actor, attemptId, includeSource) {
  const attempt = await own(M.codingAttempts, attemptId, actor);
  if (!terminal.includes(attempt.status) && attempt.deadlineAt <= new Date()) {
    await finish(attempt, 'SERVICE_TIMEOUT');
    return codingPublic(await M.codingAttempts.findById(attempt._id), { includeSource });
  }
  return codingPublic(attempt, { includeSource });
}
