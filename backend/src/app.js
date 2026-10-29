import { profileRoutes } from './student-profile.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config, allowedOrigins } from './config.js';
import { M, transaction } from './models.js';
import { AppError, errorHandler, fail } from './errors.js';
import {
  id,
  uuid,
  version,
  email,
  password,
  hash,
  sameId,
  publicDoc,
  cleanObject,
  pagination,
  listResult,
  percent,
  round,
} from './utils.js';
import {
  authRoutes,
  authenticate,
  allowRoles,
  scope,
  own,
  profile,
  audit,
  validateEnrollment,
} from './auth.js';
import {
  visibleNodes,
  learningData,
  progressPublic,
  dashboard,
  recomputeRecommendation,
  recommendationPublic,
  summarizeMistakes,
} from './progress.js';
import {
  definitionKinds,
  createDefinition,
  mutateDefinition,
  mutateNode,
  exercisePublic,
  assessmentPublic,
  checkpointPublic,
} from './content.js';
import {
  startSimulation,
  simulationPublic,
  controlSimulation,
  startAssessment,
  assessmentAttemptPublic,
  saveAnswers,
  finalizeAssessment,
  openPrediction,
  answerPrediction,
} from './learning.js';
import { executionMode, createCoding, codingPublic, getCoding } from './coding.js';
import { comparisonInput, measureComparison } from './algorithms.js';
export function createApp({ disableRateLimits = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(
    helmet(),
    cors({
      origin: (origin, callback) =>
        callback(null, allowedOrigins().includes(origin) ? origin : false),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    }),
    express.json({ limit: '128kb', strict: true }),
    cookieParser(),
  );
  app.use((req, res, next) => {
    try {
      cleanObject(req.body);
      cleanObject(req.query);
      if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json'))
        fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
      next();
    } catch (e) {
      next(e);
    }
  });
  const limiter = (limit, windowMs, keyGenerator, skip, skipSuccessfulRequests = false) =>
    disableRateLimits
      ? (req, res, next) => next()
      : rateLimit({
          windowMs,
          limit,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          keyGenerator,
          skip: skip || (() => false),
          skipSuccessfulRequests,
          handler: (req, res) => {
            const retryAfterSeconds = Math.max(
              1,
              Math.ceil(
                ((req.rateLimit?.resetTime?.getTime() || Date.now() + windowMs) - Date.now()) /
                  1000,
              ),
            );
            res.setHeader('Retry-After', retryAfterSeconds);
            res.status(429).json({
              error: { code: 'RATE_LIMITED', message: 'Request limit exceeded', details: [] },
              meta: { requestId: req.requestId },
            });
          },
        });
  const router = express.Router(),
    send = (res, data, status = 200, meta = {}) =>
      res.status(status).json({
        data,
        meta: { requestId: res.req.requestId, sourceMode: data?.sourceMode || 'REAL', ...meta },
      });
  router.use(
    '/auth/login',
    limiter(config.production ? 5 : 20, 15 * 60000, undefined, undefined, !config.production),
    limiter(
      config.production ? 5 : 20,
      15 * 60000,
      (req) => hash(String(req.body?.email || '').toLowerCase()),
      undefined,
      !config.production,
    ),
  );
  router.use('/auth/register', limiter(3, 3600000));
  for (const route of ['/auth/refresh', '/auth/csrf'])
    router.use(
      route,
      limiter(20, 60000, async (req) => {
        const credential = req.cookies?.[config.production ? '__Host-refresh' : 'traceRefreshDev'];
        if (!credential) return ipKeyGenerator(req.ip);
        const s = await M.authSessions.findOne({ tokenHash: hash(credential) }).select('familyId');
        return hash(s?.familyId || credential);
      }),
    );
  router.get('/auth/enrollment-options', limiter(60, 60000), async (req, res) => {
    const subjects = await M.curriculumNodes
      .find({ kind: 'SUBJECT', status: 'PUBLISHED' })
      .sort({ sortOrder: 1 })
      .lean();
    send(res, {
      subjects: subjects.map((s) => ({
        id: String(s._id),
        title: s.title,
        courseCode: s.courseCode,
        academicYear: s.courseCode === '2301212' ? 'SY' : 'TY',
      })),
    });
  });
  router.use(
    '/users/me',
    authenticate,
    limiter(120, 60000, (req) => String(req.actor._id)),
  );
  router.use(
    '/users/me/password',
    limiter(10, 3600000, (req) => String(req.actor._id)),
  );
  authRoutes(router, send);
  router.use(authenticate);
  router.use((req, res, next) => {
    req.rateKey = String(req.actor._id);
    next();
  });
  const generalLimit = limiter(120, 60000, (req) => req.rateKey),
    playbackLimit = limiter(300, 60000, (req) => req.rateKey);
  router.use((req, res, next) =>
    req.path.startsWith('/simulation-sessions/')
      ? playbackLimit(req, res, next)
      : generalLimit(req, res, next),
  );
  const student = allowRoles('STUDENT'),
    staff = allowRoles('FACULTY', 'ADMIN'),
    admin = allowRoles('ADMIN');
  profileRoutes(router, send, student);
  const paged = (req, res, rows, filters, sorts, convert = publicDoc) => {
    const p = pagination(req.query, filters, sorts),
      v = listResult(rows, p);
    send(res, v.rows.map(convert), 200, v.meta);
  };
  router.get('/curriculum', async (req, res) => {
    let nodes = await visibleNodes(req.actor);
    if (req.query.parentId) {
      id.parse(req.query.parentId);
      nodes = nodes.filter((n) => sameId(n.parentId, req.query.parentId));
    }
    if (req.query.kind) {
      if (!['YEAR', 'SEMESTER', 'SUBJECT', 'UNIT', 'TOPIC'].includes(req.query.kind))
        fail(422, 'VALIDATION_ERROR', 'Unknown node kind');
      nodes = nodes.filter((n) => n.kind === req.query.kind);
    }
    if (req.query.status) {
      if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(req.query.status))
        fail(422, 'VALIDATION_ERROR', 'Unknown publication status');
      nodes = nodes.filter((n) => n.status === req.query.status);
    }
    let topicIds = nodes.filter((n) => n.kind === 'TOPIC').map((n) => n._id),
      assets = await Promise.all(
        ['learningResources', 'simulations', 'assessments', 'codingExercises'].map((k) =>
          M[k]
            .find({ topicId: { $in: topicIds }, status: 'PUBLISHED' })
            .select('topicId')
            .lean(),
        ),
      );
    paged(req, res, nodes, ['parentId', 'kind', 'status'], ['sortOrder', 'title'], (n) => ({
      ...publicDoc(n),
      ...(n.kind === 'TOPIC'
        ? {
            availability: Object.fromEntries(
              ['understand', 'simulate', 'assess', 'code'].map((k, i) => [
                k,
                assets[i].some((a) => sameId(a.topicId, n._id)),
              ]),
            ),
          }
        : {}),
    }));
  });
  router.post(
    '/curriculum',
    staff,
    limiter(30, 60000, (req) => req.rateKey),
    async (req, res) =>
      send(
        res,
        publicDoc(await mutateNode(req.body, req.actor)),
        req.body.operation === 'CREATE' ? 201 : 200,
      ),
  );
  for (const [route, kind, convert] of [
    ['resources', 'learningResources', publicDoc],
    ['simulations', 'simulations', publicDoc],
    ['assessments', 'assessments', assessmentPublic],
    ['exercises', 'codingExercises', exercisePublic],
  ])
    router.get(`/topics/:topicId/${route}`, async (req, res) => {
      await scope(req.actor, req.params.topicId, {
        topic: true,
        published: req.actor.role === 'STUDENT',
      });
      let status = req.actor.role === 'STUDENT' ? 'PUBLISHED' : req.query.status || 'PUBLISHED';
      if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status))
        fail(422, 'VALIDATION_ERROR', 'Invalid publication status');
      const rows = await M[kind]
          .find({
            topicId: req.params.topicId,
            status,
            ...(req.query.algorithm ? { algorithm: req.query.algorithm } : {}),
          })
          .lean(),
        p = pagination(req.query, ['status', 'algorithm'], ['title']),
        result = listResult(rows, p);
      if (route === 'exercises')
        send(
          res,
          { exercises: result.rows.map(convert), executionMode: executionMode() },
          200,
          result.meta,
        );
      else send(res, result.rows.map(convert), 200, result.meta);
    });
  router.post('/topics/:topicId/resources', async (req, res) => {
    id.parse(req.params.topicId);
    const op = req.body?.operation;
    if (op === 'READ') {
      if (req.actor.role !== 'STUDENT')
        fail(403, 'ROLE_FORBIDDEN', 'Only students record learning activity');
      const b = z
        .object({ operation: z.literal('READ'), resourceId: id })
        .strict()
        .parse(req.body);
      await scope(req.actor, req.params.topicId, { topic: true });
      const resource = await M.learningResources.findOne({
        _id: b.resourceId,
        topicId: req.params.topicId,
        status: 'PUBLISHED',
      });
      if (!resource) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
      const prior = await M.topicProgress.findOne({
          userId: req.actor._id,
          topicId: req.params.topicId,
        }),
        reads = (prior?.readConfirmations || [])
          .filter(
            (r) =>
              !sameId(r.resourceId, resource._id) &&
              new Date(r.readAt) > Date.now() - 365 * 86400000,
          )
          .map((r) => ({ resourceId: r.resourceId, readAt: r.readAt }));
      reads.push({ resourceId: resource._id, readAt: new Date() });
      if (reads.length > 1000) fail(422, 'VALIDATION_ERROR', 'Read-confirmation limit reached');
      await M.topicProgress.findOneAndUpdate(
        { userId: req.actor._id, topicId: req.params.topicId },
        { $set: { readConfirmations: reads }, $inc: { recordVersion: 1 } },
        { upsert: true, new: true },
      );
      const data = await learningData(req.actor);
      await recomputeRecommendation(req.actor, data);
      return send(
        res,
        progressPublic(data.rows.find((r) => sameId(r.topicId, req.params.topicId))),
      );
    }
    if (!['FACULTY', 'ADMIN'].includes(req.actor.role))
      fail(403, 'ROLE_FORBIDDEN', 'Role cannot perform this action');
    let result;
    if (op === 'CREATE') {
      const b = z
        .object({ operation: z.literal('CREATE'), resource: z.unknown() })
        .strict()
        .parse(req.body);
      if (String(b.resource?.topicId) !== req.params.topicId)
        fail(422, 'TOPIC_MISMATCH', 'Definition topics do not match');
      result = await createDefinition('learningResources', b.resource, req.actor);
    } else if (op === 'UPDATE') {
      const b = z
        .object({ operation: z.literal('UPDATE'), id, resource: z.record(z.string(), z.unknown()) })
        .strict()
        .parse(req.body);
      let { recordVersion, ...definition } = b.resource;
      if (String(definition.topicId) !== req.params.topicId)
        fail(422, 'TOPIC_MISMATCH', 'Definition topics do not match');
      result = await mutateDefinition(
        'learningResources',
        b.id,
        { action: 'UPDATE', recordVersion, definition },
        req.actor,
      );
    } else if (op === 'ARCHIVE') {
      const b = z
        .object({ operation: z.literal('ARCHIVE'), id, recordVersion: version })
        .strict()
        .parse(req.body);
      const original = await M.learningResources.findById(b.id);
      if (!original || !sameId(original.topicId, req.params.topicId))
        fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
      result = await mutateDefinition(
        'learningResources',
        b.id,
        { action: 'ARCHIVE', recordVersion: b.recordVersion },
        req.actor,
      );
    } else fail(422, 'VALIDATION_ERROR', 'Unknown resource action');
    send(res, publicDoc(result), op === 'CREATE' ? 201 : 200);
  });
  router.post('/simulation-sessions', student, async (req, res) => {
    const { doc, status } = await startSimulation(req.actor, req.body);
    send(res, await simulationPublic(doc), status);
  });
  router.patch('/simulation-sessions/:id', student, async (req, res) =>
    send(res, await controlSimulation(req.actor, req.params.id, req.body)),
  );
  router.post('/assessment-attempts', student, async (req, res) => {
    const { doc, status } = await startAssessment(req.actor, req.body);
    send(res, assessmentAttemptPublic(doc), status);
  });
  router.patch('/assessment-attempts/:id/answers', student, async (req, res) =>
    send(res, await saveAnswers(req.actor, req.params.id, req.body)),
  );
  router.post('/assessment-attempts/:id/finalize', student, async (req, res) =>
    send(res, await finalizeAssessment(req.actor, req.params.id, req.body)),
  );
  router.get('/coding-attempts', student, async (req, res) => {
    if (req.query.topicId) await scope(req.actor, id.parse(req.query.topicId), { topic: true });
    const rows = await M.codingAttempts
      .find({ userId: req.actor._id, ...(req.query.topicId ? { topicId: req.query.topicId } : {}) })
      .sort({ createdAt: -1 })
      .lean();
    paged(req, res, rows, ['topicId'], ['createdAt'], codingPublic);
  });
  router.get('/assessment-attempts', student, async (req, res) => {
    if (req.query.assessmentId) id.parse(req.query.assessmentId);
    if (req.query.status)
      z.enum(['IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'ABANDONED']).parse(req.query.status);
    const rows = await M.assessmentAttempts
      .find({
        userId: req.actor._id,
        ...(req.query.assessmentId ? { assessmentId: req.query.assessmentId } : {}),
        ...(req.query.status ? { status: req.query.status } : {}),
      })
      .sort({ createdAt: -1 })
      .lean();
    paged(req, res, rows, ['assessmentId', 'status'], ['createdAt'], assessmentAttemptPublic);
  });
  router.post(
    '/coding-attempts',
    student,
    limiter(
      5,
      60000,
      (req) => req.rateKey,
      async (req) =>
        Boolean(
          typeof req.body?.idempotencyKey === 'string' &&
          (await M.codingAttempts.exists({
            userId: req.actor._id,
            idempotencyKey: req.body.idempotencyKey,
          })),
        ),
    ),
    async (req, res) => {
      const { attempt, status } = await createCoding(req.actor, req.body);
      send(res, codingPublic(attempt), status);
    },
  );
  router.get('/coding-attempts/:id', student, async (req, res) => {
    const q = z
      .object({ includeSource: z.enum(['true', 'false']).optional() })
      .strict()
      .parse(req.query);
    send(res, await getCoding(req.actor, req.params.id, q.includeSource === 'true'));
  });
  router.get('/simulations/:simulationId/checkpoints', async (req, res) => {
    const sim = await M.simulations.findById(id.parse(req.params.simulationId));
    if (!sim) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
    await scope(req.actor, sim.topicId, { topic: true });
    paged(
      req,
      res,
      await M.predictionCheckpoints
        .find({ _id: { $in: sim.enabledCheckpointIds }, status: 'PUBLISHED' })
        .lean(),
      [],
      ['createdAt'],
      checkpointPublic,
    );
  });
  router.post('/prediction-attempts', student, async (req, res) =>
    send(res, await openPrediction(req.actor, req.body)),
  );
  router.post('/prediction-attempts/:id/responses', student, async (req, res) =>
    send(res, await answerPrediction(req.actor, req.params.id, req.body)),
  );
  router.get('/recommendations', student, async (req, res) => {
    const filter = { userId: req.actor._id };
    if (req.query.status) {
      if (!['ACTIVE', 'DISMISSED', 'COMPLETED', 'SUPERSEDED'].includes(req.query.status))
        fail(422, 'VALIDATION_ERROR', 'Unknown recommendation status');
      filter.status = req.query.status;
    }
    paged(
      req,
      res,
      await M.recommendations.find(filter).lean(),
      ['status'],
      ['createdAt'],
      recommendationPublic,
    );
  });
  router.post('/recommendations/recompute', student, async (req, res) => {
    z.object({}).strict().parse(req.body);
    send(res, { recommendation: await recomputeRecommendation(req.actor) });
  });
  router.patch('/recommendations/:id', student, async (req, res) => {
    const b = z
        .object({ action: z.literal('DISMISS'), recordVersion: version })
        .strict()
        .parse(req.body),
      doc = await own(M.recommendations, req.params.id, req.actor);
    if (doc.status !== 'ACTIVE')
      fail(409, 'INVALID_TRANSITION', 'Recommendation is no longer active');
    const result = await M.recommendations.findOneAndUpdate(
      { _id: doc._id, recordVersion: b.recordVersion, status: 'ACTIVE' },
      { $set: { status: 'DISMISSED' }, $inc: { recordVersion: 1 } },
      { new: true },
    );
    if (!result) fail(409, 'STALE_VERSION', 'Record version has changed');
    send(res, recommendationPublic(result));
  });
  router.get('/mistakes', student, async (req, res) => {
    if (req.query.topicId) await scope(req.actor, id.parse(req.query.topicId), { topic: true });
    const data = await learningData(req.actor),
      rows = summarizeMistakes(data)
        .filter(
          (r) =>
            (!req.query.topicId || r.topicId === req.query.topicId) &&
            (!req.query.classification || r.classification === req.query.classification) &&
            (!req.query.recurring || String(r.recurring) === req.query.recurring),
        )
        .map(({ sources, kinds, evidenceIds, ...r }) => r);
    paged(req, res, rows, ['topicId', 'classification', 'recurring'], ['lastSeenAt'], (r) => r);
  });
  router.post(
    '/comparisons',
    student,
    limiter(
      10,
      60000,
      (req) => req.rateKey,
      async (req) =>
        Boolean(
          typeof req.body?.idempotencyKey === 'string' &&
          (await M.comparisonRuns.exists({
            userId: req.actor._id,
            idempotencyKey: req.body.idempotencyKey,
          })),
        ),
    ),
    async (req, res) => {
      const b = z
          .object({
            topicId: id,
            arrangement: z.enum(['CUSTOM', 'SORTED', 'REVERSE', 'RANDOM', 'DUPLICATES']),
            size: z.number().optional(),
            seed: z.number().optional(),
            input: z.array(z.number()).optional(),
            idempotencyKey: uuid,
          })
          .strict()
          .parse(req.body),
        requestHash = hash({ ...b, idempotencyKey: undefined }),
        existing = await M.comparisonRuns.findOne({
          userId: req.actor._id,
          idempotencyKey: b.idempotencyKey,
        });
      if (existing) {
        if (existing.requestHash !== requestHash)
          fail(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with another payload');
        return send(res, comparisonPublic(existing));
      }
      await scope(req.actor, b.topicId, { topic: true });
      if (
        !(await M.simulations.exists({
          topicId: b.topicId,
          algorithm: { $in: ['BUBBLE_SORT', 'MERGE_SORT'] },
          status: 'PUBLISHED',
        }))
      )
        fail(422, 'INVALID_COMPARISON_INPUT', 'Choose a supported sorting topic');
      const input = comparisonInput(b),
        doc = await M.comparisonRuns.create({
          userId: req.actor._id,
          topicId: b.topicId,
          input,
          arrangement: b.arrangement,
          seed: b.seed ?? null,
          results: measureComparison(input),
          idempotencyKey: b.idempotencyKey,
          requestHash,
        });
      send(res, comparisonPublic(doc), 201);
    },
  );
  router.get('/comparisons/:id', student, async (req, res) =>
    send(res, comparisonPublic(await own(M.comparisonRuns, req.params.id, req.actor))),
  );
  router.get('/students/:studentId/dashboard', student, async (req, res) => {
    if (!sameId(id.parse(req.params.studentId), req.actor._id))
      fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
    z.object({ subjectId: id.optional() }).strict().parse(req.query);
    if (req.query.subjectId) await scope(req.actor, req.query.subjectId);
    send(res, await dashboard(req.actor, { subjectId: req.query.subjectId }));
  });
  router.get('/topics/:topicId/progress', student, async (req, res) => {
    await scope(req.actor, req.params.topicId, { topic: true });
    const data = await learningData(req.actor);
    send(res, progressPublic(data.rows.find((r) => r.topicId === req.params.topicId)));
  });
  router.get('/faculty/progress', staff, async (req, res) => {
    const p = pagination(
      req.query,
      ['subjectId', 'studentId', 'masteryBand', 'reason'],
      ['displayName', 'completionPercent'],
    );
    id.parse(req.query.subjectId);
    await scope(req.actor, req.query.subjectId);
    if (req.actor.role === 'ADMIN' && (!req.query.reason || req.query.reason.length > 500))
      fail(422, 'VALIDATION_ERROR', 'An administrative access reason is required');
    if (req.query.studentId) id.parse(req.query.studentId);
    const masteryFilter = req.query.masteryBand
      ? z.enum(['INSUFFICIENT', 'WEAK', 'DEVELOPING', 'MASTERED']).parse(req.query.masteryBand)
      : null;
    const students = await M.users.find({
        role: 'STUDENT',
        status: 'ACTIVE',
        subjectIds: req.query.subjectId,
        ...(req.query.studentId ? { _id: req.query.studentId } : {}),
      }),
      rows = [];
    for (const user of students) {
      const d = await dashboard(user, { subjectId: req.query.subjectId }),
        topics = d.topics;
      if (masteryFilter && !topics.some((topic) => topic.masteryBand === masteryFilter)) continue;
      rows.push({
        studentId: user._id,
        displayName: user.displayName,
        subjectId: req.query.subjectId,
        completionPercent: d.overallCompletionPercent,
        assessedTopicCount: topics.filter((t) => t.masteryPercent !== null).length,
        masteredTopicCount: topics.filter((t) => t.masteryBand === 'MASTERED').length,
        weakTopicIds: topics.filter((t) => t.masteryBand === 'WEAK').map((t) => t.topicId),
        assessmentMeanPercent: d.metrics.assessmentMeanPercent,
        codingCorrectCount: d.metrics.codingCorrectCount,
        predictionAccuracyPercent: d.metrics.predictionAccuracyPercent,
      });
    }
    if (req.actor.role === 'ADMIN')
      await audit(
        req.actor,
        'API-32',
        'users',
        null,
        'Read scoped student progress',
        req.query.reason,
      );
    const selected = listResult(rows, p);
    send(res, selected.rows, 200, selected.meta);
  });
  router.get('/content/:kind', staff, async (req, res) => {
    if (!['learningResources', ...definitionKinds].includes(req.params.kind))
      fail(404, 'RESOURCE_NOT_FOUND', 'Definition type not found');
    const p = pagination(req.query, ['topicId', 'status'], ['createdAt', 'key']);
    if (req.query.status) z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).parse(req.query.status);
    if (req.query.topicId)
      await scope(req.actor, id.parse(req.query.topicId), {
        write: true,
        topic: true,
        published: false,
      });
    const allowed = (await visibleNodes(req.actor))
        .filter((n) => n.kind === 'TOPIC')
        .map((n) => n._id),
      filter = {
        topicId: req.query.topicId || { $in: allowed },
        ...(req.query.status ? { status: req.query.status } : {}),
      },
      items = await M[req.params.kind].find(filter).lean(),
      r = listResult(items, p);
    send(res, r.rows.map(publicDoc), 200, r.meta);
  });
  router.post(
    '/content/:kind',
    staff,
    limiter(30, 60000, (req) => req.rateKey),
    async (req, res) => {
      if (!['learningResources', ...definitionKinds].includes(req.params.kind))
        fail(404, 'RESOURCE_NOT_FOUND', 'Definition type not found');
      send(res, publicDoc(await createDefinition(req.params.kind, req.body, req.actor)), 201);
    },
  );
  router.patch(
    '/content/:kind/:id',
    staff,
    limiter(30, 60000, (req) => req.rateKey),
    async (req, res) => {
      if (!['learningResources', ...definitionKinds].includes(req.params.kind))
        fail(404, 'RESOURCE_NOT_FOUND', 'Definition type not found');
      send(
        res,
        publicDoc(await mutateDefinition(req.params.kind, req.params.id, req.body, req.actor)),
      );
    },
  );
  router.get('/admin/users', admin, async (req, res) => {
    const q = pagination(req.query, ['role', 'status'], ['displayName', 'createdAt']),
      filter = {};
    if (req.query.role) filter.role = z.enum(['STUDENT', 'FACULTY', 'ADMIN']).parse(req.query.role);
    if (req.query.status)
      filter.status = z
        .enum(['ACTIVE', 'DISABLED', 'DELETION_PENDING', 'ANONYMIZED'])
        .parse(req.query.status);
    let items = await M.users.find(filter).lean(),
      v = listResult(items, q);
    send(res, v.rows.map(profile), 200, v.meta);
  });
  router.post('/admin/users', admin, async (req, res) => {
    const b = z
      .object({
        email,
        displayName: z.string().min(1).max(80),
        password,
        role: z.enum(['STUDENT', 'FACULTY', 'ADMIN']),
        academicYear: z.enum(['SY', 'TY']).nullable().optional(),
        subjectIds: z.array(id).max(4),
      })
      .strict()
      .parse(req.body);
    await validateEnrollment(b.role, b.academicYear, b.subjectIds);
    const { password: pwd, ...fields } = b,
      user = await M.users.create({ ...fields, passwordHash: await bcrypt.hash(pwd, 12) });
    await audit(req.actor, 'API-35', 'users', user._id, 'Provisioned account');
    send(res, profile(user), 201);
  });
  router.patch('/admin/users/:id', admin, async (req, res) => {
    const b = z
      .object({
        recordVersion: version,
        displayName: z.string().min(1).max(80).optional(),
        role: z.enum(['STUDENT', 'FACULTY', 'ADMIN']).optional(),
        academicYear: z.enum(['SY', 'TY']).nullable().optional(),
        subjectIds: z.array(id).max(4).optional(),
        status: z.enum(['ACTIVE', 'DISABLED']).optional(),
      })
      .strict()
      .parse(req.body);
    if (Object.keys(b).length === 1) fail(422, 'VALIDATION_ERROR', 'Provide a field to update');
    let user = await M.users.findById(id.parse(req.params.id));
    if (!user) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
    if (['DELETION_PENDING', 'ANONYMIZED'].includes(user.status))
      fail(409, 'INVALID_TRANSITION', 'Account cannot be reactivated');
    await validateEnrollment(
      b.role || user.role,
      b.academicYear === undefined ? user.academicYear : b.academicYear,
      b.subjectIds || user.subjectIds,
    );
    let result;
    await transaction(async (session) => {
      await guardLastAdmin(user, b, session);
      const { recordVersion, ...fields } = b;
      result = await M.users.findOneAndUpdate(
        { _id: user._id, recordVersion },
        {
          $set: fields,
          $inc: { recordVersion: 1, ...(b.role || b.status ? { authVersion: 1 } : {}) },
        },
        { new: true, session, runValidators: true },
      );
      if (!result) fail(409, 'STALE_VERSION', 'Record version has changed');
      if (b.role || b.status)
        await M.authSessions.updateMany(
          { userId: user._id },
          { $set: { revokedAt: new Date() } },
          { session },
        );
      await audit(
        req.actor,
        'API-36',
        'users',
        user._id,
        'Updated account permissions/status',
        null,
        session,
      );
    });
    send(res, profile(result));
  });
  router.post('/users/me/deletion', async (req, res) => {
    const b = z.object({ currentPassword: z.string() }).strict().parse(req.body),
      user = await M.users.findById(req.actor._id).select('+passwordHash');
    if (!(await bcrypt.compare(b.currentPassword, user.passwordHash)))
      fail(401, 'INVALID_CREDENTIALS', 'Email or password is invalid');
    await transaction(async (session) => {
      await guardLastAdmin(user, { status: 'DELETION_PENDING' }, session);
      await M.users.updateOne(
        { _id: user._id },
        {
          $set: { status: 'DELETION_PENDING', deletionRequestedAt: new Date() },
          $inc: { authVersion: 1, recordVersion: 1 },
        },
        { session },
      );
      await M.authSessions.updateMany(
        { userId: user._id },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      await audit(user, 'API-37', 'users', user._id, 'Account deletion requested', null, session);
    });
    send(res, { status: 'DELETION_PENDING', purgeBy: new Date(Date.now() + 8 * 86400000) });
  });
  router.get('/admin/rules', staff, async (req, res) => {
    const r = publicDoc(await M.ruleConfigs.findOne({ isActive: true }));
    if (req.actor.role === 'FACULTY') {
      const topics = (await visibleNodes(req.actor)).filter((n) => n.kind === 'TOPIC');
      r.misconceptions = r.misconceptions.filter((m) =>
        topics.some((t) => sameId(t._id, m.topicId)),
      );
    }
    send(res, r);
  });
  router.post('/admin/rules', admin, async (req, res) => {
    const b = z
      .object({
        version: z.number().int().positive(),
        thresholds: z
          .object({
            weakBelow: z.number().int().min(0).max(99),
            masteredAt: z.number().int().min(1).max(100),
            minimumAssessments: z.number().int().min(2).max(3),
            assessmentWindow: z.literal(3),
            recurrenceAttempts: z.number().int().min(2).max(3),
            misconceptionWindowDays: z.number().int().min(1).max(90),
          })
          .strict(),
        misconceptions: z
          .array(
            z
              .object({
                code: z.string().regex(/^[A-Z_]{1,60}$/),
                label: z.string().min(1).max(120),
                topicId: id,
                revisionResourceId: id,
                simulationId: id.nullable().optional(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict()
      .safeParse(req.body);
    if (!b.success || b.data.thresholds.weakBelow >= b.data.thresholds.masteredAt)
      fail(422, 'INVALID_RULE_CONFIG', 'Rule configuration is invalid');
    const data = b.data;
    if (new Set(data.misconceptions.map((m) => m.code)).size !== data.misconceptions.length)
      fail(422, 'INVALID_RULE_CONFIG', 'Misconception codes must be unique');
    for (const m of data.misconceptions) {
      await scope(req.actor, m.topicId, { topic: true });
      const r = await M.learningResources.findOne({
        _id: m.revisionResourceId,
        topicId: m.topicId,
        status: 'PUBLISHED',
      });
      if (
        !r ||
        (m.simulationId &&
          !(await M.simulations.exists({
            _id: m.simulationId,
            topicId: m.topicId,
            status: 'PUBLISHED',
          })))
      )
        fail(422, 'INVALID_RULE_CONFIG', 'Rule mapping target is unavailable');
    }
    let doc;
    await transaction(async (session) => {
      const last = await M.ruleConfigs.findOne().sort({ version: -1 }).session(session);
      if (data.version !== last.version + 1) fail(409, 'STALE_VERSION', 'Rule version has changed');
      await M.ruleConfigs.updateMany(
        { isActive: true },
        { $set: { isActive: false } },
        { session },
      );
      [doc] = await M.ruleConfigs.create([{ ...data, isActive: true, createdBy: req.actor._id }], {
        session,
      });
      await audit(
        req.actor,
        'API-39',
        'ruleConfigs',
        doc._id,
        'Activated recommendation rules',
        null,
        session,
      );
    });
    send(res, publicDoc(doc), 201);
  });
  router.get('/admin/audit', admin, async (req, res) => {
    const p = pagination(req.query, ['actorId', 'action', 'from', 'to'], ['createdAt']),
      filter = {};
    if (req.query.actorId) filter.actorId = id.parse(req.query.actorId);
    if (req.query.action) filter.action = z.string().max(50).parse(req.query.action);
    if (req.query.from || req.query.to) {
      let from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 365 * 86400000),
        to = req.query.to ? new Date(req.query.to) : new Date();
      if (
        !Number.isFinite(+from) ||
        !Number.isFinite(+to) ||
        to < from ||
        to - from > 365 * 86400000
      )
        fail(422, 'VALIDATION_ERROR', 'Audit date range is invalid');
      filter.createdAt = { $gte: from, $lte: to };
    }
    const rows = await M.auditEvents.find(filter).lean(),
      result = listResult(rows, p);
    send(res, result.rows.map(publicDoc), 200, result.meta);
  });
  app.use('/api/v1', router);
  app.use((req, res, next) => next(new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found')));
  app.use(errorHandler);
  return app;
}
async function guardLastAdmin(user, changes, session) {
  if (
    user.role !== 'ADMIN' ||
    user.status !== 'ACTIVE' ||
    ((!changes.status || changes.status === 'ACTIVE') &&
      (!changes.role || changes.role === 'ADMIN'))
  )
    return;
  await M.ruleConfigs.updateOne({ isActive: true }, { $inc: { recordVersion: 1 } }, { session });
  if ((await M.users.countDocuments({ role: 'ADMIN', status: 'ACTIVE' }).session(session)) <= 1)
    fail(409, 'LAST_ADMIN', 'Last active administrator must remain active');
}
function comparisonPublic(doc) {
  const v = publicDoc(doc);
  delete v.userId;
  delete v.idempotencyKey;
  delete v.requestHash;
  return {
    ...v,
    measurementLabel: 'OPERATION_COUNTS',
    complexity: [
      { algorithm: 'BUBBLE_SORT', best: 'Θ(n)', average: 'Θ(n²)', worst: 'Θ(n²)', space: 'Θ(1)' },
      {
        algorithm: 'MERGE_SORT',
        best: 'Θ(n log n)',
        average: 'Θ(n log n)',
        worst: 'Θ(n log n)',
        space: 'Θ(n)',
      },
    ],
  };
}
