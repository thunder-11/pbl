import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { M } from '../src/models.js';
import { config, allowedOrigins } from '../src/config.js';
import { createApp } from '../src/app.js';
import { seedDatabase, seedId } from '../src/seed.js';
import { cleanup } from '../src/maintenance.js';
import { processCodingJobs } from '../src/coding.js';
const root = fileURLToPath(new URL('../..', import.meta.url)),
  pwd = 'IsolatedTestPassword123';
let mongo, app, student, other, faculty, admin, simulation, assessment, prediction;
const token = (label) =>
  jwt.sign(
    {
      role: label.startsWith('student') ? 'STUDENT' : label === 'admin' ? 'ADMIN' : 'FACULTY',
      authVersion: 1,
    },
    config.secret,
    {
      subject: String(seedId(label)),
      expiresIn: '15m',
      issuer: config.issuer,
      audience: config.audience,
    },
  );
const auth = (method, url, who = student) =>
  request(app)
    [method]('/api/v1' + url)
    .set('Authorization', 'Bearer ' + who);
const key = () => crypto.randomUUID();
before(
  async () => {
    config.secret = 'isolated-test-secret-with-more-than-thirty-two-characters';
    config.production = false;
    config.executionMode = 'UNAVAILABLE';
    let uri;
    try {
      uri = JSON.parse(
        readFileSync(path.join(root, '.data/dev-session.json'), 'utf8'),
      ).mongoUri.replace('/trace_dev', '/trace_integration_test');
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 1000 });
    } catch {
      if (mongoose.connection.readyState) await mongoose.disconnect();
      process.env.MONGOMS_DOWNLOAD_DIR = path.join(root, '.data/mongodb-binaries');
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      mongo = await MongoMemoryReplSet.create({
        binary: { version: '7.0.14' },
        replSet: { count: 1 },
      });
      await mongoose.connect(mongo.getUri('trace_integration_test'));
    }
    assert.equal(mongoose.connection.name, 'trace_integration_test');
    await mongoose.connection.dropDatabase();
    for (const m of Object.values(M)) await m.createIndexes();
    await seedDatabase({ studentPassword: pwd, facultyPassword: pwd, adminPassword: pwd });
    app = createApp({ disableRateLimits: true });
    student = token('student-a');
    other = token('student-b');
    faculty = token('faculty-a');
    admin = token('admin');
  },
  { timeout: 120000 },
);
after(async () => {
  if (mongoose.connection.name === 'trace_integration_test')
    await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
test('Exact curriculum seed counts and real empty-data metrics', async () => {
  for (const [name, count] of Object.entries({
    users: 6,
    curriculumNodes: 70,
    learningResources: 14,
    simulations: 12,
    assessments: 14,
    questions: 70,
    codingExercises: 12,
    predictionCheckpoints: 3,
    assessmentAttempts: 6,
    codingAttempts: 4,
    simulationSessions: 3,
    predictionAttempts: 2,
    topicProgress: 92,
    mistakeEvidence: 19,
  }))
    assert.equal(await M[name].countDocuments(), count, name);
  const r = await auth('get', `/students/${seedId('student-a')}/dashboard`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.topics.length, 40);
  const nodes = await auth('get', '/curriculum?pageSize=100');
  assert.ok(
    nodes.body.data.every(
      (n) => /^[a-f0-9]{24}$/.test(n.id) && (!n.parentId || typeof n.parentId === 'string'),
    ),
  );
  assert.equal(r.body.data.overallCompletionPercent, 0);
  assert.equal(r.body.data.metrics.assessmentCount, 0);
  assert.ok(r.body.data.topics.every((t) => t.masteryPercent === null));
  assert.equal(r.body.data.recommendations[0].reasonCode, 'FIRST_USE');
});
test('Login hashes stay private; wrong credentials rejected', async () => {
  const good = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'student-a@example.invalid', password: pwd });
  assert.equal(good.status, 200);
  assert.equal(good.body.data.expiresIn, 900);
  assert.equal(good.body.data.user.passwordHash, undefined);
  assert.match(good.headers['set-cookie'][0], /HttpOnly/);
  const bad = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'student-a@example.invalid', password: 'wrong' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');
});
test('Refresh bootstrap,rotation,CSRF and token reuse', async () => {
  const agent = request.agent(app),
    login = await agent
      .post('/api/v1/auth/login')
      .set('Origin', config.origin)
      .send({ email: 'student-b@example.invalid', password: pwd }),
    oldCookie = login.headers['set-cookie'][0].split(';')[0],
    oldCsrf = login.body.data.csrfToken;
  let csrf = await agent.post('/api/v1/auth/csrf').set('Origin', config.origin).send({});
  assert.equal(csrf.status, 200);
  let wrong = await agent
    .post('/api/v1/auth/refresh')
    .set('Origin', config.origin)
    .set('X-CSRF-Token', 'wrong')
    .send({});
  assert.equal(wrong.body.error.code, 'CSRF_INVALID');
  let rotated = await agent
    .post('/api/v1/auth/refresh')
    .set('Origin', config.origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({});
  assert.equal(rotated.status, 200);
  let reused = await request(app)
    .post('/api/v1/auth/refresh')
    .set('Origin', config.origin)
    .set('Cookie', oldCookie)
    .set('X-CSRF-Token', oldCsrf)
    .send({});
  assert.equal(reused.body.error.code, 'REFRESH_REUSED');
  let wrongOrigin = await agent
    .post('/api/v1/auth/csrf')
    .set('Origin', 'https://untrusted.invalid')
    .send({});
  assert.equal(wrongOrigin.status, 403);
});
test('Missing,expired and invalid JWTs fail', async () => {
  assert.equal((await request(app).get('/api/v1/users/me')).status, 401);
  let expired = jwt.sign({ role: 'STUDENT', authVersion: 1 }, config.secret, {
    subject: String(seedId('student-a')),
    expiresIn: -120,
    issuer: config.issuer,
    audience: config.audience,
  });
  assert.equal((await auth('get', '/users/me', expired)).body.error.code, 'TOKEN_EXPIRED');
  assert.equal((await auth('get', '/users/me', 'forged')).body.error.code, 'TOKEN_INVALID');
});
test('Student role injection,duplicate registration and short passwords fail', async () => {
  let body = {
    email: 'new@example.invalid',
    displayName: 'New student',
    password: pwd,
    academicYear: 'SY',
    subjectIds: [String(seedId('course-2301212'))],
  };
  assert.equal(
    (
      await request(app)
        .post('/api/v1/auth/register')
        .send({ ...body, role: 'ADMIN' })
    ).status,
    422,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/auth/register')
        .send({ ...body, email: 'student-a@example.invalid' })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/auth/register')
        .send({ ...body, password: 'short1' })
    ).status,
    422,
  );
  assert.equal((await request(app).post('/api/v1/auth/register').send(body)).status, 201);
});
test('Year boundaries permit explicit TY prerequisite but reject SY enrollment into TY', async () => {
  const base = { displayName: 'Enrollment check', password: pwd };
  assert.equal(
    (
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...base,
          email: 'ty-check@example.invalid',
          academicYear: 'TY',
          subjectIds: [String(seedId('course-2301212'))],
        })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...base,
          email: 'sy-check@example.invalid',
          academicYear: 'SY',
          subjectIds: [String(seedId('course-2301301'))],
        })
    ).status,
    422,
  );
});
test('Foreign dashboard,unauthorized faculty action and unassigned progress fail', async () => {
  assert.equal((await auth('get', `/students/${seedId('student-b')}/dashboard`)).status, 404);
  assert.equal((await auth('post', '/curriculum').send({})).status, 403);
  assert.equal(
    (await auth('get', `/faculty/progress?subjectId=${seedId('course-2301303')}`, faculty)).body
      .error.code,
    'SUBJECT_FORBIDDEN',
  );
});
test('Malformed JSON,unknown fields,NoSQL operators and invalid pagination fail', async () => {
  assert.equal(
    (
      await auth('post', '/simulation-sessions')
        .set('Content-Type', 'application/json')
        .send('{bad')
    ).status,
    400,
  );
  assert.equal((await auth('get', '/curriculum?page=0')).body.error.code, 'INVALID_PAGINATION');
  assert.equal((await auth('get', '/curriculum?pageSize=101')).status, 422);
  assert.equal((await auth('get', '/curriculum?sort=passwordHash')).status, 422);
  assert.equal(
    (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: { $ne: null }, password: pwd })
    ).status,
    422,
  );
});
test('Invalid topic references and immutable published definitions fail', async () => {
  const resource = await M.learningResources.findOne();
  let b = { ...resource.toObject(), topicId: String(new mongoose.Types.ObjectId()) };
  for (const k of ['_id', 'createdAt', 'updatedAt', 'recordVersion', 'createdBy']) delete b[k];
  let invalid = await auth('post', '/content/learningResources', admin).send(b);
  assert.equal(invalid.status, 422);
  let immutable = await auth('patch', `/content/learningResources/${resource._id}`, admin).send({
    action: 'UPDATE',
    recordVersion: resource.recordVersion,
    definition: b,
  });
  assert.equal(immutable.body.error.code, 'PUBLISHED_IMMUTABLE');
});
test('Binary simulation validates input,binds checkpoints and rejects foreign edits', async () => {
  let sim = await M.simulations.findById(seedId('course-2301212-u1-t3-sim'));
  let invalid = await auth('post', '/simulation-sessions').send({
    simulationId: String(sim._id),
    input: { array: [3, 1, 2], target: 1 },
    idempotencyKey: key(),
  });
  assert.equal(invalid.body.error.code, 'INVALID_SIMULATION_INPUT');
  const k = key(),
    body = { simulationId: String(sim._id), input: sim.defaultInput, idempotencyKey: k },
    r = await auth('post', '/simulation-sessions').send(body);
  assert.equal(r.status, 201);
  simulation = r.body.data;
  assert.equal((await auth('post', '/simulation-sessions').send(body)).body.data.id, simulation.id);
  assert.equal(
    (
      await auth('post', '/simulation-sessions').send({
        ...body,
        input: { array: [1, 2], target: 1 },
      })
    ).body.error.code,
    'IDEMPOTENCY_CONFLICT',
  );
  assert.equal(
    (
      await auth('patch', `/simulation-sessions/${simulation.id}`, other).send({
        command: 'NEXT',
        recordVersion: simulation.recordVersion,
      })
    ).status,
    404,
  );
  const next = await auth('patch', `/simulation-sessions/${simulation.id}`).send({
    command: 'NEXT',
    recordVersion: simulation.recordVersion,
  });
  simulation = next.body.data;
  assert.equal(simulation.state.event, 'PROBE');
  assert.ok(simulation.pendingPredictionId);
  const blocked = await auth('patch', `/simulation-sessions/${simulation.id}`).send({
    command: 'NEXT',
    recordVersion: simulation.recordVersion,
  });
  assert.equal(blocked.body.error.code, 'PREDICTION_PENDING');
});
test('Prediction wrong state,first scoring,retry and retry limit', async () => {
  const cp = await M.predictionCheckpoints
    .findById(simulation.pendingPredictionId)
    .catch(() => null);
  let p = await M.predictionAttempts.findById(simulation.pendingPredictionId);
  let open = await auth('post', '/prediction-attempts').send({
    sessionId: simulation.id,
    checkpointId: String(p.checkpointId),
    cursor: simulation.cursor,
    stateHash: simulation.currentStateHash,
  });
  assert.equal(open.status, 200);
  prediction = open.body.data;
  const body = {
    action: 'ANSWER',
    choiceId: 'A',
    cursor: simulation.cursor,
    stateHash: simulation.currentStateHash,
    recordVersion: prediction.recordVersion,
  };
  let wrong = await auth('post', `/prediction-attempts/${prediction.id}/responses`).send({
    ...body,
    cursor: 0,
  });
  assert.equal(wrong.body.error.code, 'WRONG_SIMULATION_STATE');
  let first = await auth('post', `/prediction-attempts/${prediction.id}/responses`).send(body);
  assert.equal(first.body.data.firstCorrect, false);
  let retry = await auth('post', `/prediction-attempts/${prediction.id}/responses`).send({
    ...body,
    choiceId: 'B',
    recordVersion: first.body.data.recordVersion,
  });
  assert.equal(retry.body.data.firstCorrect, false);
  assert.equal(retry.body.data.responses[1].correct, true);
  let third = await auth('post', `/prediction-attempts/${prediction.id}/responses`).send({
    ...body,
    recordVersion: retry.body.data.recordVersion,
  });
  assert.equal(third.body.error.code, 'RETRY_LIMIT');
});
test('Simulation completes and reset preserves completedAt', async () => {
  while (!simulation.state.done) {
    const r = await auth('patch', `/simulation-sessions/${simulation.id}`).send({
      command: 'NEXT',
      recordVersion: simulation.recordVersion,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    simulation = r.body.data;
  }
  assert.equal(simulation.state.pointers.targetIndex, 3);
  const completed = simulation.completedAt;
  let reset = await auth('patch', `/simulation-sessions/${simulation.id}`).send({
    command: 'RESET',
    recordVersion: simulation.recordVersion,
  });
  assert.equal(reset.body.data.cursor, 0);
  assert.equal(reset.body.data.completedAt, completed);
});
test('Assessment answer validation,completeness,score and idempotent finalization', async () => {
  const r = await auth('post', '/assessment-attempts').send({
    assessmentId: String(seedId('course-2301212-u1-t3-assessment')),
    idempotencyKey: key(),
  });
  assessment = r.body.data;
  assert.equal(r.status, 201);
  assert.equal(assessment.questions[0].correctOptionId, undefined);
  const invalid = await auth('patch', `/assessment-attempts/${assessment.id}/answers`).send({
    recordVersion: assessment.recordVersion,
    answers: [{ questionId: assessment.questions[0].questionId, optionId: 'Z' }],
  });
  assert.equal(invalid.body.error.code, 'INVALID_ANSWER');
  const incomplete = await auth('post', `/assessment-attempts/${assessment.id}/finalize`).send({
    action: 'SUBMIT',
    recordVersion: assessment.recordVersion,
    idempotencyKey: key(),
  });
  assert.equal(incomplete.body.error.code, 'INCOMPLETE_ASSESSMENT');
  const saved = await auth('patch', `/assessment-attempts/${assessment.id}/answers`).send({
    recordVersion: assessment.recordVersion,
    answers: assessment.questions.map((q, i) => ({
      questionId: q.questionId,
      optionId: 'BAADA'[i],
    })),
  });
  assessment = saved.body.data;
  const k = key(),
    body = { action: 'SUBMIT', recordVersion: assessment.recordVersion, idempotencyKey: k },
    submitted = await auth('post', `/assessment-attempts/${assessment.id}/finalize`).send(body);
  assert.equal(submitted.body.data.scorePercent, 40);
  assert.ok(submitted.body.data.questions[0].correctOptionId);
  assert.equal(
    (await auth('post', `/assessment-attempts/${assessment.id}/finalize`).send(body)).body.data
      .scorePercent,
    40,
  );
  assert.equal(
    (
      await auth('post', `/assessment-attempts/${assessment.id}/finalize`).send({
        ...body,
        idempotencyKey: key(),
      })
    ).body.error.code,
    'ALREADY_SUBMITTED',
  );
});
test('Second conceptual mistake produces recurring targeted recommendation', async () => {
  const first = await auth('post', '/assessment-attempts').send({
      assessmentId: String(seedId('course-2301212-u1-t3-assessment')),
      idempotencyKey: key(),
    }),
    a = first.body.data;
  const save = await auth('patch', `/assessment-attempts/${a.id}/answers`).send({
    recordVersion: a.recordVersion,
    answers: a.questions.map((q, i) => ({ questionId: q.questionId, optionId: 'BAADA'[i] })),
  });
  const finish = await auth('post', `/assessment-attempts/${a.id}/finalize`).send({
    action: 'SUBMIT',
    recordVersion: save.body.data.recordVersion,
    idempotencyKey: key(),
  });
  assert.equal(finish.status, 200);
  const r = await auth('post', '/recommendations/recompute').send({});
  assert.equal(r.body.data.recommendation.reasonCode, 'RECURRING');
  assert.equal(
    r.body.data.recommendation.targetId,
    String(seedId('course-2301212-u1-t3-resource')),
  );
  const d = await auth('get', `/students/${seedId('student-a')}/dashboard`);
  let row = d.body.data.topics.find((t) => t.topicId === String(seedId('course-2301212-u1-t3')));
  assert.equal(row.masteryPercent, 40);
  assert.equal(row.masteryBand, 'WEAK');
});
test('DBMS has only two completion categories and rejects SQL execution language', async () => {
  const topicId = String(seedId('course-2301303-u5-t1')),
    p = await auth('get', `/topics/${topicId}/progress`);
  assert.deepEqual(p.body.data.availableCategories, ['UNDERSTAND', 'ASSESS']);
  let read = await auth('post', `/topics/${topicId}/resources`).send({
    operation: 'READ',
    resourceId: String(seedId('course-2301303-u5-t1-resource')),
  });
  assert.equal(read.body.data.completionPercent, 50);
  let sql = await auth('post', '/coding-attempts').send({
    exerciseId: String(seedId('course-2301212-u1-t4-exercise')),
    language: 'SQL',
    mode: 'RUN',
    sourceCode: 'SELECT 1',
    idempotencyKey: key(),
  });
  assert.equal(sql.body.error.code, 'UNSUPPORTED_LANGUAGE');
});
test('Code unavailable,malformed requests and explicit mock do not create real progress', async () => {
  let b = {
    exerciseId: String(seedId('course-2301212-u1-t4-exercise')),
    language: 'CPP',
    mode: 'RUN',
    sourceCode: 'int main(){return 0;}',
    idempotencyKey: key(),
  };
  assert.equal(
    (await auth('post', '/coding-attempts').send(b)).body.error.code,
    'EXECUTION_UNAVAILABLE',
  );
  assert.equal(
    (await auth('post', '/coding-attempts').send({ ...b, sourceCode: 'a'.repeat(33000) })).status,
    413,
  );
  assert.equal((await auth('post', '/coding-attempts').send({ ...b, correct: true })).status, 422);
  config.executionMode = 'MOCK';
  const mock = await auth('post', '/coding-attempts').send(b);
  assert.equal(mock.status, 200);
  assert.equal(mock.body.data.sourceMode, 'MOCK');
  assert.equal(mock.body.data.correct, false);
  assert.equal(
    (await auth('post', '/coding-attempts').send({ ...b, mode: 'GRADE', idempotencyKey: key() }))
      .body.error.code,
    'REAL_GRADING_REQUIRED',
  );
  config.executionMode = 'UNAVAILABLE';
});
test('Code exercise identifiers,hidden test redaction and foreign ownership', async () => {
  config.executionMode = 'MOCK';
  let missing = await auth('post', '/coding-attempts').send({
    exerciseId: String(new mongoose.Types.ObjectId()),
    language: 'CPP',
    mode: 'RUN',
    sourceCode: 'int main(){}',
    idempotencyKey: key(),
  });
  assert.equal(missing.status, 404);
  config.executionMode = 'UNAVAILABLE';
  const examples = await auth('get', `/topics/${seedId('course-2301212-u1-t4')}/exercises`);
  assert.equal(examples.body.data.exercises[0].tests, undefined);
  const attempt = await auth('get', `/coding-attempts/${seedId('fixture-code-0')}`);
  const hidden = attempt.body.data.results.find((r) => r.visibility === 'HIDDEN');
  assert.equal(hidden.stdout, undefined);
  assert.equal(hidden.expectedStdout, undefined);
  assert.equal(
    (await auth('get', `/coding-attempts/${seedId('fixture-code-0')}`, other)).status,
    404,
  );
});
test('Comparison counts and invalid comparison input', async () => {
  const r = await auth('post', '/comparisons').send({
    topicId: String(seedId('course-2301212-u1-t4')),
    arrangement: 'CUSTOM',
    input: [3, 2, 1],
    idempotencyKey: key(),
  });
  assert.equal(r.status, 201);
  assert.deepEqual(
    r.body.data.results.map((r) => r.comparisons),
    [3, 2],
  );
  assert.equal(r.body.data.measurementLabel, 'OPERATION_COUNTS');
  const invalid = await auth('post', '/comparisons').send({
    topicId: String(seedId('course-2301212-u1-t4')),
    arrangement: 'REVERSE',
    size: 129,
    idempotencyKey: key(),
  });
  assert.equal(invalid.body.error.code, 'INVALID_COMPARISON_INPUT');
});
test('Faculty aggregates omit source code,raw answers and email', async () => {
  const r = await auth('get', `/faculty/progress?subjectId=${seedId('course-2301212')}`, faculty);
  assert.equal(r.status, 200);
  assert.ok(r.body.data.length);
  for (const row of r.body.data) {
    assert.equal(row.email, undefined);
    assert.equal(row.sourceCode, undefined);
    assert.equal(row.answers, undefined);
  }
});
test('Admin-only rules enforce threshold order and immutable revisions', async () => {
  let r = await auth('get', '/admin/rules', admin),
    b = {
      version: r.body.data.version + 1,
      thresholds: { ...r.body.data.thresholds, weakBelow: 90, masteredAt: 80 },
      misconceptions: r.body.data.misconceptions,
    };
  assert.equal(
    (await auth('post', '/admin/rules', admin).send(b)).body.error.code,
    'INVALID_RULE_CONFIG',
  );
  assert.equal((await auth('get', '/admin/audit', faculty)).status, 403);
  assert.equal((await auth('get', '/admin/users')).status, 403);
});
test('Last administrator cannot be disabled or deleted', async () => {
  const user = await M.users.findById(seedId('admin'));
  assert.equal(
    (
      await auth('patch', `/admin/users/${user._id}`, admin).send({
        recordVersion: user.recordVersion,
        status: 'DISABLED',
      })
    ).body.error.code,
    'LAST_ADMIN',
  );
  assert.equal(
    (await auth('post', '/users/me/deletion', admin).send({ currentPassword: pwd })).body.error
      .code,
    'LAST_ADMIN',
  );
});
test('Live API rate limits return429 and Retry-After', async () => {
  config.production = true;
  let limited;
  try {
    limited = createApp();
  } finally {
    config.production = false;
  }
  for (let i = 0; i < 5; i++)
    await request(limited)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.invalid', password: 'wrong' });
  const result = await request(limited)
    .post('/api/v1/auth/login')
    .send({ email: 'unknown@example.invalid', password: 'wrong' });
  assert.equal(result.status, 429);
  assert.ok(result.headers['retry-after']);
  assert.equal(result.body.error.code, 'RATE_LIMITED');
});

test('Local demo sign-ins do not exhaust the login budget and localhost supports refresh', async () => {
  const local = createApp();
  for (let index = 0; index < 6; index++) {
    const response = await request(local)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'student-a@example.invalid', password: pwd });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
  const agent = request.agent(local);
  await agent
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: 'faculty-a@example.invalid', password: pwd })
    .expect(200);
  const csrf = await agent
    .post('/api/v1/auth/csrf')
    .set('Origin', 'http://localhost:5173')
    .send({})
    .expect(200);
  await agent
    .post('/api/v1/auth/refresh')
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send({})
    .expect(200);
  await agent.post('/api/v1/auth/csrf').set('Origin', 'http://localhost:5174').send({}).expect(403);
  config.production = true;
  try {
    assert.deepEqual(allowedOrigins(), [config.origin]);
  } finally {
    config.production = false;
  }
});
test('Provider adapter contracts use synthetic transport,never a local compiler', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0,
    posts = 0,
    mode = 'pass',
    jobs = new Map();
  config.executionMode = 'REAL';
  config.providerVerified = true;
  config.providerUrl = 'https://executor.example.invalid';
  for (const l of ['C', 'CPP', 'JAVA', 'PYTHON']) process.env['JUDGE0_LANGUAGE_' + l] = '1';
  globalThis.fetch = async (url, options = {}) => {
    requests++;
    if (options.method === 'POST') {
      posts++;
      let b = JSON.parse(options.body);
      assert.equal(b.enable_network, false);
      assert.equal(b.cpu_time_limit, 2);
      assert.equal(b.wall_time_limit, 5);
      assert.equal(b.memory_limit, 131072);
      if (mode === 'transport') throw Error('Synthetic lost provider response');
      const token = 'synthetic-token-' + posts;
      jobs.set(token, { mode, stdin: Buffer.from(b.stdin, 'base64').toString() });
      return { ok: true, status: 201, json: async () => ({ token }) };
    }
    const token = new URL(url).pathname.split('/').at(-1),
      job = jobs.get(token),
      status = job.mode === 'compile' ? 6 : job.mode === 'runtime' ? 7 : 3,
      stdout =
        job.mode === 'wrong' ? '0\n' : job.stdin.startsWith('3\n') ? '1 2 3\n' : '-1 0 2 2\n';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: { id: status },
        stdout: Buffer.from(stdout).toString('base64'),
        stderr:
          job.mode === 'runtime'
            ? Buffer.from('Synthetic runtime failure').toString('base64')
            : null,
        compile_output:
          job.mode === 'compile'
            ? Buffer.from('Synthetic compile failure').toString('base64')
            : null,
      }),
    };
  };
  try {
    for (const [caseMode, expected] of [
      ['pass', 'PASSED'],
      ['wrong', 'FAILED_TESTS'],
      ['compile', 'COMPILE_ERROR'],
      ['runtime', 'RUNTIME_ERROR'],
      ['transport', 'SERVICE_ERROR'],
    ]) {
      mode = caseMode;
      let body = {
          exerciseId: String(seedId('course-2301212-u1-t4-exercise')),
          language: 'CPP',
          mode: 'GRADE',
          sourceCode: 'SYNTHETIC_PROVIDER_CONTRACT_TEST',
          idempotencyKey: key(),
        },
        create = await auth('post', '/coding-attempts').send(body);
      assert.equal(create.status, 202, JSON.stringify(create.body));
      for (let i = 0; i < 6; i++) {
        await M.codingAttempts.updateOne(
          { _id: create.body.data.id },
          { $set: { nextPollAt: new Date(0) } },
        );
        await processCodingJobs();
      }
      const result = await auth('get', '/coding-attempts/' + create.body.data.id);
      assert.equal(result.body.data.status, expected);
      assert.equal(result.body.data.correct, caseMode === 'pass');
      if (caseMode === 'transport') {
        const attempts = posts;
        await processCodingJobs();
        assert.equal(posts, attempts);
        const replay = await auth('post', '/coding-attempts').send(body);
        assert.equal(replay.body.data.id, create.body.data.id);
      }
    }
    mode = 'pass';
    let pending = await auth('post', '/coding-attempts').send({
      exerciseId: String(seedId('course-2301212-u1-t4-exercise')),
      language: 'CPP',
      mode: 'RUN',
      sourceCode: 'SYNTHETIC_TIMEOUT_TEST',
      idempotencyKey: key(),
    });
    await M.codingAttempts.updateOne(
      { _id: pending.body.data.id },
      { $set: { deadlineAt: new Date(0) } },
    );
    const timeout = await auth('get', '/coding-attempts/' + pending.body.data.id);
    assert.equal(timeout.status, 200);
    assert.equal(timeout.body.data.status, 'SERVICE_TIMEOUT');
    assert.equal(timeout.body.data.correct, false);
    assert.ok(requests > 0);
  } finally {
    globalThis.fetch = originalFetch;
    config.executionMode = 'UNAVAILABLE';
    config.providerVerified = false;
  }
});
test('Faculty can author and publish a resource revision without altering earlier content', async () => {
  const previous = await M.learningResources.findById(seedId('course-2301212-u1-t3-resource'));
  const body = {
    topicId: String(previous.topicId),
    key: previous.key,
    version: 2,
    status: 'DRAFT',
    title: 'Binary Search revision review',
    content:
      '# Binary Search\n\nMaintain the sorted search interval and exclude the examined midpoint.',
    referenceUrl: null,
  };
  const draft = await auth('post', `/topics/${previous.topicId}/resources`, faculty).send({
    operation: 'CREATE',
    resource: body,
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  const published = await auth(
    'patch',
    `/content/learningResources/${draft.body.data.id}`,
    faculty,
  ).send({ action: 'PUBLISH', recordVersion: draft.body.data.recordVersion });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.data.status, 'PUBLISHED');
  assert.equal((await M.learningResources.findById(previous._id)).status, 'ARCHIVED');
  assert.equal((await M.learningResources.findById(previous._id)).content, previous.content);
});
test('Degree profile persists validated owner details and keeps evidence beyond one year', async () => {
  const url = '/users/me/student-profile';
  assert.equal((await request(app).get('/api/v1' + url)).status, 401);
  assert.equal((await auth('get', url, faculty)).status, 403);
  const before = (await auth('get', url)).body.data;
  assert.equal(before.user.id, String(seedId('student-a')));
  assert.equal(before.user.passwordHash, undefined);
  const body = {
    displayName: before.user.displayName,
    institution: 'Engineering College',
    degree: 'BE Computer Engineering',
    studentNumber: 'CE-2026-17',
    admissionYear: 2026,
    graduationYear: 2030,
    stage: 'FY',
    bio: 'Learning systems programming.',
    goals: 'Build a compiler.',
    projects: [
      { title: 'Compiler', description: 'Course project', url: 'https://example.org/compiler' },
    ],
  };
  const saved = await auth('patch', url).send(body);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.details.studentNumber, body.studentNumber);
  assert.equal((await auth('get', url)).body.data.details.goals, body.goals);
  assert.notEqual(
    (await auth('get', url, other)).body.data.details.studentNumber,
    body.studentNumber,
  );
  assert.equal(
    (await auth('patch', url).send({ ...body, userId: String(seedId('student-b')) })).status,
    422,
  );
  assert.equal((await auth('patch', url).send({ ...body, graduationYear: 2020 })).status, 422);
  assert.equal(
    (
      await auth('patch', url).send({
        ...body,
        projects: [{ title: 'Unsafe', url: 'javascript:alert(1)' }],
      })
    ).status,
    422,
  );
  const attempt = await M.assessmentAttempts.findOne({ userId: seedId('student-a') });
  assert.ok(attempt);
  const original = attempt.createdAt;
  const old = new Date(Date.now() - 800 * 86400000);
  await M.assessmentAttempts.collection.updateOne(
    { _id: attempt._id },
    { $set: { createdAt: old } },
    { timestamps: false },
  );
  await cleanup();
  assert.ok(await M.assessmentAttempts.findById(attempt._id));
  const history = (await auth('get', url)).body.data;
  assert.ok(history.years.some((y) => y.year === old.getUTCFullYear() && y.assessmentAttempts > 0));
  assert.equal(
    history.totals.assessmentAttempts,
    await M.assessmentAttempts.countDocuments({ userId: seedId('student-a') }),
  );
  await M.assessmentAttempts.collection.updateOne(
    { _id: attempt._id },
    { $set: { createdAt: original } },
    { timestamps: false },
  );
});

test('Deletion revokes access then purges learner data and anonymizes the author stub', async () => {
  await M.users.updateOne(
    { _id: seedId('student-c') },
    { $set: { 'studentProfile.bio': 'Personal biography' } },
  );
  const who = token('student-c'),
    r = await auth('post', '/users/me/deletion', who).send({ currentPassword: pwd });
  assert.equal(r.status, 200);
  assert.equal((await auth('get', '/users/me', who)).status, 401);
  await M.users.updateOne(
    { _id: seedId('student-c') },
    { $set: { deletionRequestedAt: new Date(Date.now() - 8 * 86400000) } },
  );
  await cleanup();
  const user = await M.users.findById(seedId('student-c'));
  assert.equal(user.status, 'ANONYMIZED');
  assert.ok(!user.studentProfile?.bio);
  assert.equal(user.email, `${user._id}@deleted.invalid`);
  assert.equal(await M.topicProgress.countDocuments({ userId: user._id }), 0);
});

test('Production curriculum bootstrap creates content without demo learner identities or history', async () => {
  assert.equal(mongoose.connection.name, 'trace_integration_test');
  await mongoose.connection.dropDatabase();
  for (const model of Object.values(M)) await model.createIndexes();
  await M.users.create({
    _id: seedId('admin'),
    email: 'bootstrap@example.invalid',
    displayName: 'Initial administrator',
    passwordHash: 'opaque-test-hash',
    role: 'ADMIN',
    academicYear: null,
    subjectIds: [],
  });
  await assert.rejects(seedDatabase({ productionContentOnly: true }), /Explicit bootstrap/);
  process.env.ALLOW_CURRICULUM_BOOTSTRAP = 'true';
  try {
    await seedDatabase({ productionContentOnly: true });
    assert.equal(await M.users.countDocuments(), 1);
    assert.equal(await M.curriculumNodes.countDocuments(), 70);
    assert.equal(await M.learningResources.countDocuments(), 14);
    for (const name of [
      'topicProgress',
      'assessmentAttempts',
      'codingAttempts',
      'simulationSessions',
      'predictionAttempts',
      'mistakeEvidence',
      'recommendations',
    ])
      assert.equal(await M[name].countDocuments(), 0, name);
    await seedDatabase({ productionContentOnly: true });
    assert.equal(await M.curriculumNodes.countDocuments(), 70);
  } finally {
    delete process.env.ALLOW_CURRICULUM_BOOTSTRAP;
  }
});
