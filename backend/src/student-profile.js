import { z } from 'zod';
import { M } from './models.js';
import { profile } from './auth.js';
const optionalText = (max) => z.string().trim().max(max).default('');
const year = z.number().int().min(1950).max(2200).nullable().default(null);
export const studentProfileInput = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    institution: optionalText(160),
    degree: optionalText(120),
    studentNumber: optionalText(60),
    admissionYear: year,
    graduationYear: year,
    stage: z.enum(['FY', 'SY', 'TY', 'FINAL', 'GRADUATED']).nullable().default(null),
    bio: optionalText(1000),
    goals: optionalText(2000),
    projects: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(120),
            description: optionalText(1000),
            url: z
              .union([
                z.literal(''),
                z
                  .string()
                  .url()
                  .max(500)
                  .refine((v) => /^https?:\/\//.test(v), 'Use an HTTP or HTTPS link'),
              ])
              .default(''),
          })
          .strict(),
      )
      .max(12)
      .default([]),
  })
  .strict()
  .refine((v) => !v.admissionYear || !v.graduationYear || v.graduationYear >= v.admissionYear, {
    message: 'Graduation year must follow admission year',
    path: ['graduationYear'],
  });
const collections = [
  ['assessmentAttempts', 'Assessment'],
  ['codingAttempts', 'Coding'],
  ['simulationSessions', 'Simulation'],
  ['predictionAttempts', 'Prediction'],
  ['comparisonRuns', 'Comparison'],
];
export async function degreeProfile(user) {
  const byYear = new Map(),
    totals = {},
    recent = [];
  for (const [collection, label] of collections) {
    const [groups, events] = await Promise.all([
      M[collection].aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: { $year: '$createdAt' }, count: { $sum: 1 } } },
      ]),
      M[collection]
        .find({ userId: user._id })
        .sort({ createdAt: -1, _id: -1 })
        .limit(20)
        .select('topicId status scorePercent createdAt')
        .lean(),
    ]);
    totals[collection] = groups.reduce((n, g) => n + g.count, 0);
    for (const g of groups) {
      const row = byYear.get(g._id) || { year: g._id, total: 0 };
      row[collection] = g.count;
      row.total += g.count;
      byYear.set(g._id, row);
    }
    recent.push(
      ...events.map((e) => ({
        id: String(e._id),
        kind: label,
        topicId: e.topicId ? String(e.topicId) : null,
        status: e.status || 'Recorded',
        scorePercent: e.scorePercent ?? null,
        createdAt: e.createdAt,
      })),
    );
  }
  const topicIds = [...new Set(recent.map((e) => e.topicId).filter(Boolean))];
  const names = await M.curriculumNodes
    .find({ _id: { $in: topicIds } })
    .select('title')
    .lean();
  const subjects = await M.curriculumNodes
    .find({ _id: { $in: user.subjectIds } })
    .select('title courseCode')
    .lean();
  return {
    user: profile(user),
    details: user.studentProfile || {},
    totals,
    years: [...byYear.values()].sort((a, b) => a.year - b.year),
    subjects: subjects.map((s) => ({
      id: String(s._id),
      title: s.title,
      courseCode: s.courseCode,
    })),
    recent: recent
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
      .map((e) => ({
        ...e,
        title:
          names.find((n) => String(n._id) === e.topicId)?.title ||
          (e.kind === 'Comparison' ? 'Algorithm comparison' : 'Archived topic'),
      })),
  };
}
export function profileRoutes(router, send, student) {
  router.get('/users/me/student-profile', student, async (req, res) =>
    send(res, await degreeProfile(req.actor)),
  );
  router.patch('/users/me/student-profile', student, async (req, res) => {
    const { displayName, ...details } = studentProfileInput.parse(req.body);
    const user = await M.users.findOneAndUpdate(
      { _id: req.actor._id },
      { $set: { displayName, studentProfile: details }, $inc: { recordVersion: 1 } },
      { new: true, runValidators: true },
    );
    send(res, await degreeProfile(user));
  });
}
