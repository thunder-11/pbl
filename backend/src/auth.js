import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { z } from 'zod';
import { M, transaction } from './models.js';
import { config, allowedOrigins } from './config.js';
import { fail, requireValue } from './errors.js';
import { hash, randomSecret, email, password, id, publicDoc, sameId } from './utils.js';
export const profile = (u) => {
  let { passwordHash, authVersion, ...value } = publicDoc(u);
  return value;
};
export const cookieName = () => (config.production ? '__Host-refresh' : 'traceRefreshDev');
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.production,
  sameSite: 'lax',
  path: '/',
});
export const audit = (actor, action, targetCollection, targetId, summary, reason = null, session) =>
  M.auditEvents.create(
    [{ actorId: actor?._id || null, action, targetCollection, targetId, summary, reason }],
    session ? { session } : {},
  );
export function allowRoles(...roles) {
  return (req, res, next) =>
    roles.includes(req.actor.role)
      ? next()
      : next(
          Object.assign(new Error('Role cannot perform this action'), {
            status: 403,
            code: 'ROLE_FORBIDDEN',
          }),
        );
}
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) fail(401, 'AUTH_REQUIRED', 'Authentication required');
    let decoded;
    try {
      decoded = jwt.verify(header.slice(7), config.secret, {
        algorithms: ['HS256'],
        issuer: config.issuer,
        audience: config.audience,
        clockTolerance: 30,
      });
    } catch (e) {
      fail(
        401,
        e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        e.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
      );
    }
    const user = await M.users.findById(decoded.sub);
    if (!user || user.authVersion !== decoded.authVersion)
      fail(401, 'TOKEN_INVALID', 'Invalid access token');
    if (user.status !== 'ACTIVE') fail(403, 'ACCOUNT_DISABLED', 'Account is not active');
    req.actor = user;
    next();
  } catch (e) {
    next(e);
  }
}
export function requireOrigin(req) {
  requireValue(
    allowedOrigins().includes(req.headers.origin),
    403,
    'ORIGIN_FORBIDDEN',
    'Browser origin is not allowed',
  );
}
async function getSession(req, { csrf = true } = {}) {
  requireOrigin(req);
  let token = req.cookies[cookieName()];
  if (!token) fail(401, 'AUTH_REQUIRED', 'Authentication required');
  let s = await M.authSessions.findOne({ tokenHash: hash(token) });
  if (!s || s.expiresAt <= new Date()) fail(401, 'AUTH_REQUIRED', 'Authentication required');
  if (s.revokedAt) {
    if (s.rotatedToId) {
      await M.authSessions.updateMany(
        { familyId: s.familyId },
        { $set: { revokedAt: new Date() } },
      );
      fail(401, 'REFRESH_REUSED', 'Refresh session was revoked');
    }
    fail(401, 'AUTH_REQUIRED', 'Authentication required');
  }
  if (csrf && (!req.headers['x-csrf-token'] || hash(req.headers['x-csrf-token']) !== s.csrfHash))
    fail(403, 'CSRF_INVALID', 'CSRF token is invalid');
  let u = await M.users.findById(s.userId);
  if (!u || u.status !== 'ACTIVE') fail(401, 'AUTH_REQUIRED', 'Authentication required');
  return { s, u };
}
async function issue(user, res, old) {
  const refresh = randomSecret(),
    csrf = randomSecret();
  let created;
  await transaction(async (session) => {
    if (old) {
      const claimed = await M.authSessions.updateOne(
        { _id: old._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      if (claimed.modifiedCount !== 1) fail(401, 'REFRESH_REUSED', 'Refresh session was revoked');
    }
    const [s] = await M.authSessions.create(
      [
        {
          userId: user._id,
          tokenHash: hash(refresh),
          csrfHash: hash(csrf),
          familyId: old?.familyId || crypto.randomUUID(),
          expiresAt: old?.expiresAt || new Date(Date.now() + 7 * 86400000),
        },
      ],
      { session },
    );
    created = s;
    if (old)
      await M.authSessions.updateOne(
        { _id: old._id },
        { $set: { rotatedToId: s._id } },
        { session },
      );
  });
  res.cookie(cookieName(), refresh, { ...cookieOptions(), maxAge: created.expiresAt - Date.now() });
  return {
    accessToken: jwt.sign({ role: user.role, authVersion: user.authVersion }, config.secret, {
      subject: String(user._id),
      expiresIn: '15m',
      issuer: config.issuer,
      audience: config.audience,
      algorithm: 'HS256',
    }),
    expiresIn: 900,
    csrfToken: csrf,
    user: profile(user),
  };
}
export async function validateEnrollment(role, academicYear, subjectIds) {
  let subjects = await M.curriculumNodes.find({
    _id: { $in: subjectIds },
    kind: 'SUBJECT',
    status: 'PUBLISHED',
  });
  if (
    subjects.length !== new Set(subjectIds.map(String)).size ||
    new Set(subjectIds.map(String)).size !== subjectIds.length
  )
    fail(422, 'VALIDATION_ERROR', 'Subject enrollment is invalid');
  if (role === 'STUDENT') {
    if (!['SY', 'TY'].includes(academicYear))
      fail(422, 'VALIDATION_ERROR', 'Select an academic year');
    for (const sub of subjects) {
      const sem = await M.curriculumNodes.findById(sub.parentId),
        year = sem && (await M.curriculumNodes.findById(sem.parentId));
      if (
        year?.key !== academicYear.toLowerCase() &&
        !(academicYear === 'TY' && sub.courseCode === '2301212')
      )
        fail(
          422,
          'VALIDATION_ERROR',
          'Subject does not match the academic year or prerequisite exception',
        );
    }
  } else if (academicYear !== null && academicYear !== undefined)
    fail(422, 'VALIDATION_ERROR', 'Staff accounts have no academic year');
}
export async function subjectFor(nodeId, { published = true } = {}) {
  let node = await M.curriculumNodes.findById(id.parse(String(nodeId))),
    subject = null,
    chain = [];
  while (node) {
    chain.unshift(node);
    if (published && node.status !== 'PUBLISHED')
      fail(409, 'CONTENT_UNAVAILABLE', 'Content is unavailable for new activity');
    if (node.kind === 'SUBJECT') subject = node;
    node = node.parentId ? await M.curriculumNodes.findById(node.parentId) : null;
  }
  if (!chain.length) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  return { subject, chain, node: chain.at(-1) };
}
export async function scope(
  actor,
  nodeId,
  { write = false, published = true, topic = false } = {},
) {
  const value = await subjectFor(nodeId, { published });
  if (topic && value.node.kind !== 'TOPIC')
    fail(422, 'INVALID_TOPIC_REFERENCE', 'Topic reference is invalid');
  if (actor.role === 'ADMIN') return value;
  if (write && actor.role === 'STUDENT')
    fail(403, 'ROLE_FORBIDDEN', 'Role cannot perform this action');
  if (value.subject && !actor.subjectIds.some((s) => sameId(s, value.subject._id)))
    fail(403, 'SUBJECT_FORBIDDEN', 'Subject access denied');
  return value;
}
export async function own(model, idValue, actor) {
  const doc = await model.findOne({ _id: id.parse(idValue), userId: actor._id });
  if (!doc) fail(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  return doc;
}
export function authRoutes(router, send) {
  router.post('/auth/register', async (req, res) => {
    const b = z
      .object({
        email,
        displayName: z.string().min(1).max(80),
        password,
        academicYear: z.enum(['SY', 'TY']),
        subjectIds: z.array(id).max(4),
      })
      .strict()
      .parse(req.body);
    if (req.headers.origin) requireOrigin(req);
    await validateEnrollment('STUDENT', b.academicYear, b.subjectIds);
    const { password: pwd, ...fields } = b;
    const user = await M.users.create({
      ...fields,
      passwordHash: await bcrypt.hash(pwd, 12),
      role: 'STUDENT',
    });
    send(res, profile(user), 201);
  });
  router.post('/auth/login', async (req, res) => {
    const b = z
      .object({ email, password: z.string().min(1).max(1000) })
      .strict()
      .parse(req.body);
    if (req.headers.origin) requireOrigin(req);
    let user = await M.users.findOne({ email: b.email }).select('+passwordHash');
    if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(b.password, user.passwordHash)))
      fail(401, 'INVALID_CREDENTIALS', 'Email or password is invalid');
    send(res, await issue(user, res));
  });
  router.post('/auth/csrf', async (req, res) => {
    z.object({}).strict().parse(req.body);
    const { s } = await getSession(req, { csrf: false }),
      csrf = randomSecret();
    await M.authSessions.updateOne(
      { _id: s._id, revokedAt: null },
      { $set: { csrfHash: hash(csrf) } },
    );
    send(res, { csrfToken: csrf });
  });
  router.post('/auth/refresh', async (req, res) => {
    z.object({}).strict().parse(req.body);
    const { s, u } = await getSession(req);
    send(res, await issue(u, res, s));
  });
  router.post('/auth/logout', async (req, res) => {
    z.object({}).strict().parse(req.body);
    const { s } = await getSession(req);
    await M.authSessions.updateMany({ familyId: s.familyId }, { $set: { revokedAt: new Date() } });
    res.clearCookie(cookieName(), cookieOptions());
    send(res, { ok: true });
  });
  router.get('/users/me', authenticate, (req, res) => send(res, profile(req.actor)));
  router.patch('/users/me/password', authenticate, async (req, res) => {
    const b = z
        .object({ currentPassword: z.string(), newPassword: password })
        .strict()
        .parse(req.body),
      user = await M.users.findById(req.actor._id).select('+passwordHash');
    if (!(await bcrypt.compare(b.currentPassword, user.passwordHash)))
      fail(401, 'INVALID_CREDENTIALS', 'Email or password is invalid');
    await transaction(async (session) => {
      await M.users.updateOne(
        { _id: user._id },
        {
          $set: { passwordHash: await bcrypt.hash(b.newPassword, 12) },
          $inc: { authVersion: 1, recordVersion: 1 },
        },
        { session },
      );
      await M.authSessions.updateMany(
        { userId: user._id },
        { $set: { revokedAt: new Date() } },
        { session },
      );
    });
    send(res, { ok: true });
  });
}
