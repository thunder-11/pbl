import { M, transaction } from './models.js';
import { hash, round, percent, sameId, asId, publicDoc } from './utils.js';
const finishedLearnerStates = [
  'PASSED',
  'FAILED_TESTS',
  'COMPILE_ERROR',
  'RUNTIME_ERROR',
  'TIME_LIMIT',
];
const latest = (a, b) =>
  new Date(b.submittedAt || b.finishedAt || b.createdAt) -
    new Date(a.submittedAt || a.finishedAt || a.createdAt) || asId(b).localeCompare(asId(a));
export async function visibleNodes(actor) {
  const nodes = await M.curriculumNodes
      .find(actor.role === 'STUDENT' ? { status: 'PUBLISHED' } : {})
      .lean(),
    byId = new Map(nodes.map((n) => [asId(n), n]));
  const belongs = (n) => {
    let cursor = n;
    while (cursor) {
      if (cursor.status !== 'PUBLISHED' && actor.role === 'STUDENT') return false;
      if (cursor.kind === 'SUBJECT')
        return actor.role === 'ADMIN' || actor.subjectIds.some((s) => sameId(s, cursor._id));
      cursor = byId.get(String(cursor.parentId));
    }
    return ['YEAR', 'SEMESTER'].includes(n.kind);
  };
  return nodes.filter(belongs);
}
export async function learningData(user, { subjectId } = {}) {
  const nodes = await visibleNodes(user),
    byId = new Map(nodes.map((n) => [asId(n), n]));
  const getSubject = (n) => {
    while (n && n.kind !== 'SUBJECT') n = byId.get(String(n.parentId));
    return n;
  };
  const topics = nodes.filter(
      (n) =>
        n.kind === 'TOPIC' &&
        n.status === 'PUBLISHED' &&
        (!subjectId || sameId(getSubject(n)?._id, subjectId)),
    ),
    ids = topics.map((n) => n._id);
  const [
    resources,
    simulations,
    assessments,
    exercises,
    assessmentAttempts,
    codingAttempts,
    sessions,
    predictions,
    progress,
    evidence,
    rules,
  ] = await Promise.all([
    M.learningResources
      .find({ topicId: { $in: ids }, status: 'PUBLISHED' })
      .sort({ key: 1 })
      .lean(),
    M.simulations
      .find({ topicId: { $in: ids }, status: 'PUBLISHED' })
      .sort({ key: 1 })
      .lean(),
    M.assessments
      .find({ topicId: { $in: ids }, status: 'PUBLISHED' })
      .sort({ key: 1 })
      .lean(),
    M.codingExercises
      .find({ topicId: { $in: ids }, status: 'PUBLISHED' })
      .sort({ key: 1 })
      .lean(),
    M.assessmentAttempts
      .find({ userId: user._id, topicId: { $in: ids }, sourceMode: 'REAL' })
      .lean(),
    M.codingAttempts.find({ userId: user._id, topicId: { $in: ids }, sourceMode: 'REAL' }).lean(),
    M.simulationSessions
      .find({ userId: user._id, topicId: { $in: ids }, sourceMode: 'REAL' })
      .lean(),
    M.predictionAttempts
      .find({ userId: user._id, topicId: { $in: ids }, sourceMode: 'REAL' })
      .lean(),
    M.topicProgress.find({ userId: user._id, topicId: { $in: ids } }).lean(),
    M.mistakeEvidence.find({ userId: user._id, topicId: { $in: ids } }).lean(),
    M.ruleConfigs.findOne({ isActive: true }).lean(),
  ]);
  const eligible = assessmentAttempts.filter((a) => a.status === 'SUBMITTED').sort(latest),
    thresholds = rules.thresholds;
  const rows = topics.map((topic) => {
    const t = asId(topic),
      filter = (a) => sameId(a.topicId, t),
      r = resources.filter(filter),
      s = simulations.filter(filter),
      a = assessments.filter(filter),
      e = exercises.filter(filter),
      p = progress.find(filter),
      window = eligible.filter(filter).slice(0, thresholds.assessmentWindow),
      raw = window.length ? window.reduce((v, a) => v + a.scorePercent, 0) / window.length : null;
    const reads = (p?.readConfirmations || []).filter(
        (x) => new Date(x.readAt) > Date.now() - 365 * 86400000,
      ),
      availableCategories = [],
      completedCategories = [];
    for (const [category, definitions, done] of [
      ['UNDERSTAND', r, r.some((v) => reads.some((x) => sameId(x.resourceId, v._id)))],
      [
        'SIMULATE',
        s,
        s.some((v) => sessions.some((x) => sameId(x.simulationId, v._id) && x.completedAt)),
      ],
      ['ASSESS', a, a.some((v) => eligible.some((x) => sameId(x.assessmentId, v._id)))],
      [
        'CODE',
        e,
        e.some((v) =>
          codingAttempts.some(
            (x) =>
              sameId(x.exerciseId, v._id) &&
              x.status === 'PASSED' &&
              x.mode === 'GRADE' &&
              x.correct,
          ),
        ),
      ],
    ]) {
      if (definitions.length) {
        availableCategories.push(category);
        if (done) completedCategories.push(category);
      }
    }
    let masteryBand =
      window.length < thresholds.minimumAssessments
        ? 'INSUFFICIENT'
        : raw < thresholds.weakBelow
          ? 'WEAK'
          : raw < thresholds.masteredAt
            ? 'DEVELOPING'
            : 'MASTERED';
    return {
      topicId: t,
      title: topic.title,
      subjectId: asId(getSubject(topic)),
      availableCategories,
      completedCategories,
      completionPercent: percent(completedCategories.length, availableCategories.length),
      masteryPercent: raw === null ? null : round(raw),
      masteryBand,
      evidenceAt: window[0]?.submittedAt || null,
      ruleVersion: rules.version,
      recordVersion: p?.recordVersion || 1,
      dataState: !availableCategories.length
        ? 'NO_ACTIVITIES'
        : !completedCategories.length
          ? 'NO_DATA'
          : 'HAS_DATA',
      _raw: raw,
      _reads: reads,
      _assessments: window,
    };
  });
  const writes = rows
    .filter((row) => {
      let p = progress.find((v) => sameId(v.topicId, row.topicId));
      return (
        !p ||
        ['completionPercent', 'masteryPercent', 'masteryBand', 'ruleVersion'].some(
          (k) => p[k] !== row[k],
        ) ||
        JSON.stringify(p.availableCategories) !== JSON.stringify(row.availableCategories) ||
        JSON.stringify(p.completedCategories) !== JSON.stringify(row.completedCategories)
      );
    })
    .map((row) => ({
      updateOne: {
        filter: { userId: user._id, topicId: row.topicId },
        update: {
          $set: {
            availableCategories: row.availableCategories,
            completedCategories: row.completedCategories,
            completionPercent: row.completionPercent,
            masteryPercent: row.masteryPercent,
            masteryBand: row.masteryBand,
            evidenceAt: row.evidenceAt,
            ruleVersion: row.ruleVersion,
          },
          $setOnInsert: { readConfirmations: [] },
          $inc: { recordVersion: 1 },
        },
        upsert: true,
      },
    }));
  if (writes.length) await M.topicProgress.bulkWrite(writes);
  return {
    nodes,
    topics,
    byId,
    rows,
    resources,
    simulations,
    assessments,
    exercises,
    eligible,
    codingAttempts,
    sessions,
    predictions,
    evidence,
    rules,
  };
}
export const progressPublic = (row) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
export function summarizeMistakes(data) {
  const map = new Map(),
    cutoff = Date.now() - data.rules.thresholds.misconceptionWindowDays * 86400000;
  const realSources = new Map(
    [
      ...data.eligible,
      ...data.codingAttempts.filter(
        (a) => a.mode === 'GRADE' && finishedLearnerStates.includes(a.status),
      ),
    ].map((a) => [asId(a), a]),
  );
  for (const e of data.evidence) {
    let source = realSources.get(String(e.sourceId));
    if (!source) continue;
    let relevant = (
      e.sourceKind === 'ASSESSMENT'
        ? data.eligible
        : data.codingAttempts.filter(
            (a) => a.mode === 'GRADE' && finishedLearnerStates.includes(a.status),
          )
    )
      .filter(
        (a) =>
          sameId(a.topicId, e.topicId) &&
          new Date(a.submittedAt || a.finishedAt || a.createdAt).getTime() >= cutoff,
      )
      .sort(latest)
      .slice(0, data.rules.thresholds.assessmentWindow);
    if (!relevant.some((a) => sameId(a._id, e.sourceId))) continue;
    const key = [e.topicId, e.classification, e.misconceptionCode].join(':');
    let group = map.get(key) || {
      topicId: String(e.topicId),
      classification: e.classification,
      misconceptionCode: e.misconceptionCode,
      label: data.rules.misconceptions.find((m) => m.code === e.misconceptionCode)?.label || null,
      sources: new Set(),
      kinds: new Map(),
      lastSeenAt: new Date(0),
      evidenceIds: [],
    };
    group.sources.add(String(e.sourceId));
    let ids = group.kinds.get(e.sourceKind) || new Set();
    ids.add(String(e.sourceId));
    group.kinds.set(e.sourceKind, ids);
    group.lastSeenAt = new Date(Math.max(+group.lastSeenAt, +new Date(e.createdAt)));
    group.evidenceIds.push(e._id);
    map.set(key, group);
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      distinctAttemptCount: g.sources.size,
      recurring:
        g.classification === 'CONCEPTUAL' &&
        [...g.kinds.values()].some((s) => s.size >= data.rules.thresholds.recurrenceAttempts),
    }))
    .sort((a, b) => Number(b.recurring) - Number(a.recurring) || b.lastSeenAt - a.lastSeenAt);
}
export const recommendationPublic = (r) => {
  if (!r) return null;
  const v = publicDoc(r);
  delete v.evidenceIds;
  delete v.evidenceHash;
  delete v.userId;
  return v;
};
export async function recomputeRecommendation(user, data) {
  data ||= await learningData(user);
  let candidates = [];
  const groups = summarizeMistakes(data),
    activityOrder = { READ: 0, SIMULATE: 1, ASSESS: 2, CODE: 3 };
  const add = (row, reasonCode, priority, kind, target, reason, evidenceIds = []) => {
    if (target)
      candidates.push({
        row,
        reasonCode,
        priority,
        activityKind: kind,
        targetId: target._id,
        reasonText: reason,
        evidenceIds,
      });
  };
  const first = (docs, t) => docs.find((x) => sameId(x.topicId, t));
  for (const row of data.rows) {
    let t = row.topicId,
      r = first(data.resources, t),
      s = first(data.simulations, t),
      a = first(data.assessments, t),
      e = first(data.exercises, t),
      count = row._assessments.length,
      last = row._assessments[0]?.submittedAt;
    const nextIncomplete = () => {
      for (const [cat, kind, target] of [
        ['UNDERSTAND', 'READ', r],
        ['SIMULATE', 'SIMULATE', s],
        ['ASSESS', 'ASSESS', a],
        ['CODE', 'CODE', e],
      ])
        if (target && !row.completedCategories.includes(cat)) return [kind, target];
      return [];
    };
    for (const g of groups.filter((g) => g.recurring && g.topicId === t)) {
      const mapping = data.rules.misconceptions.find(
        (x) => x.code === g.misconceptionCode && sameId(x.topicId, t),
      );
      if (!mapping) continue;
      const resource = data.resources.find((x) => sameId(x._id, mapping.revisionResourceId)),
        simulation = data.simulations.find((x) => sameId(x._id, mapping.simulationId));
      let kind, target;
      if (
        resource &&
        !row._reads.some(
          (x) => sameId(x.resourceId, resource._id) && new Date(x.readAt) > g.lastSeenAt,
        )
      ) {
        kind = 'READ';
        target = resource;
      } else if (
        simulation &&
        !data.sessions.some(
          (x) => sameId(x.simulationId, simulation._id) && x.completedAt > g.lastSeenAt,
        )
      ) {
        kind = 'SIMULATE';
        target = simulation;
      } else if (
        a &&
        !data.eligible.some((x) => sameId(x.assessmentId, a._id) && x.submittedAt > g.lastSeenAt)
      ) {
        kind = 'ASSESS';
        target = a;
      }
      add(
        row,
        'RECURRING',
        0,
        kind,
        target,
        `${g.label} appeared in ${g.distinctAttemptCount} recent attempts. Revisit the concept before another assessment.`,
        g.evidenceIds,
      );
    }
    if (row.masteryBand === 'WEAK') {
      let kind, target;
      if (r && !row._reads.some((x) => sameId(x.resourceId, r._id) && new Date(x.readAt) > last)) {
        kind = 'READ';
        target = r;
      } else if (
        s &&
        !data.sessions.some((x) => sameId(x.simulationId, s._id) && x.completedAt > last)
      ) {
        kind = 'SIMULATE';
        target = s;
      } else {
        kind = 'ASSESS';
        target = a;
      }
      add(
        row,
        'WEAK',
        1,
        kind,
        target,
        `${row.title} mastery is ${row.masteryPercent.toFixed(2)}%. Revise this topic.`,
      );
    } else if (count > 0 && count < data.rules.thresholds.minimumAssessments) {
      let [kind, target] =
        s && !row.completedCategories.includes('SIMULATE')
          ? ['SIMULATE', s]
          : a
            ? ['ASSESS', a]
            : nextIncomplete();
      add(
        row,
        'INSUFFICIENT',
        2,
        kind,
        target,
        `One more assessment may establish enough evidence for ${row.title}.`,
      );
    } else if (!count) {
      const [kind, target] = nextIncomplete();
      add(
        row,
        'FIRST_USE',
        3,
        kind,
        target,
        `Start ${row.title}: no submitted assessment evidence yet.`,
      );
    } else if (row.masteryBand === 'DEVELOPING') {
      let [kind, target] =
        e && !row.completedCategories.includes('CODE')
          ? ['CODE', e]
          : a
            ? ['ASSESS', a]
            : nextIncomplete();
      add(
        row,
        'PRACTISE',
        4,
        kind,
        target,
        `${row.title} mastery is ${row.masteryPercent.toFixed(2)}%. Strengthen it with practice.`,
      );
    } else if (row.masteryBand === 'MASTERED') {
      const [kind, target] = nextIncomplete();
      add(
        row,
        'PROGRESS',
        5,
        kind,
        target,
        `${row.title} has strong assessment evidence. Complete the next available activity.`,
      );
    }
  }
  const path = (row) => {
    let node = data.byId.get(row.topicId),
      parts = [];
    while (node) {
      parts.unshift(`${String(node.sortOrder).padStart(3, '0')}:${node.key}`);
      node = data.byId.get(String(node.parentId));
    }
    return parts.join('/');
  };
  candidates.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.row._raw ?? -1) - (b.row._raw ?? -1) ||
      path(a.row).localeCompare(path(b.row)) ||
      activityOrder[a.activityKind] - activityOrder[b.activityKind] ||
      asId(a.targetId).localeCompare(asId(b.targetId)),
  );
  const evidenceHash = hash({
    assessments: data.eligible.map((a) => [asId(a), a.scorePercent]),
    simulations: data.sessions.map((s) => [asId(s), s.completedAt]),
    coding: data.codingAttempts.map((c) => [asId(c), c.status, c.correct]),
    reads: data.rows.map((r) => r._reads),
    version: data.rules.version,
    targets: [...data.resources, ...data.simulations, ...data.assessments, ...data.exercises].map(
      asId,
    ),
  });
  const previous = await M.recommendations.find({ userId: user._id, sourceMode: 'REAL' });
  const choice = candidates.find(
    (c) =>
      !previous.some(
        (p) =>
          p.evidenceHash === evidenceHash &&
          sameId(p.targetId, c.targetId) &&
          ['DISMISSED', 'COMPLETED'].includes(p.status),
      ),
  );
  let recommendation = null;
  await transaction(async (session) => {
    await M.users.updateOne({ _id: user._id }, { $inc: { recordVersion: 1 } }, { session });
    const active = await M.recommendations
      .findOne({ userId: user._id, status: 'ACTIVE' })
      .session(session);
    if (
      choice &&
      active?.evidenceHash === evidenceHash &&
      sameId(active.targetId, choice.targetId)
    ) {
      recommendation = active;
      return;
    }
    if (active) {
      const since = active.createdAt,
        fulfilled =
          active.activityKind === 'READ'
            ? data.rows.some((r) =>
                r._reads.some(
                  (x) => sameId(x.resourceId, active.targetId) && new Date(x.readAt) > since,
                ),
              )
            : active.activityKind === 'SIMULATE'
              ? data.sessions.some(
                  (s) => sameId(s.simulationId, active.targetId) && s.completedAt > since,
                )
              : active.activityKind === 'ASSESS'
                ? data.eligible.some(
                    (a) => sameId(a.assessmentId, active.targetId) && a.submittedAt > since,
                  )
                : data.codingAttempts.some(
                    (c) =>
                      sameId(c.exerciseId, active.targetId) && c.correct && c.finishedAt > since,
                  );
      await M.recommendations.updateOne(
        { _id: active._id },
        { $set: { status: fulfilled ? 'COMPLETED' : 'SUPERSEDED' }, $inc: { recordVersion: 1 } },
        { session },
      );
    }
    if (choice) {
      const existing = await M.recommendations
        .findOne({ userId: user._id, evidenceHash, targetId: choice.targetId })
        .session(session);
      if (existing) {
        existing.status = 'ACTIVE';
        await existing.save({ session });
        recommendation = existing;
      } else {
        const [doc] = await M.recommendations.create(
          [
            {
              userId: user._id,
              topicId: choice.row.topicId,
              activityKind: choice.activityKind,
              targetId: choice.targetId,
              reasonCode: choice.reasonCode,
              reasonText: choice.reasonText,
              ruleVersion: data.rules.version,
              evidenceHash,
              evidenceIds: choice.evidenceIds.slice(0, 30),
            },
          ],
          { session },
        );
        recommendation = doc;
      }
    }
  });
  return recommendationPublic(recommendation);
}
export async function dashboard(user, { subjectId } = {}) {
  const data = await learningData(user, { subjectId });
  const subjectIds = [...new Set(data.rows.map((r) => r.subjectId))],
    subjects = subjectIds.map((id) => {
      let rows = data.rows.filter((r) => r.subjectId === id);
      return {
        subjectId: id,
        title: data.byId.get(id)?.title,
        courseCode: data.byId.get(id)?.courseCode,
        topicCount: rows.length,
        completionPercent: round(rows.reduce((s, r) => s + r.completionPercent, 0) / rows.length),
      };
    });
  const simulationsDone = new Set(
      data.sessions
        .filter((s) => s.completedAt && data.simulations.some((v) => sameId(v._id, s.simulationId)))
        .map((s) => String(s.simulationId)),
    ),
    answered = data.predictions.filter((p) => p.status === 'ANSWERED'),
    correct = data.codingAttempts.filter(
      (c) => c.correct && c.mode === 'GRADE' && c.status === 'PASSED',
    );
  const conclusive = data.codingAttempts.filter(
    (c) =>
      c.mode === 'GRADE' &&
      c.testSnapshot.length &&
      c.results.length === c.testSnapshot.length &&
      c.results.every((r) => !['PENDING', 'PROVIDER_ERROR'].includes(r.outcome)),
  );
  const codingOutcomeCounts = Object.fromEntries(
    [
      'PASSED',
      'FAILED_TESTS',
      'RUN_SUCCEEDED',
      'COMPILE_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT',
      'SERVICE_ERROR',
      'SERVICE_TIMEOUT',
      'QUEUED',
      'RUNNING',
    ].map((s) => [s, data.codingAttempts.filter((c) => c.status === s).length]),
  );
  const metrics = {
    assessmentMeanPercent: data.eligible.length
      ? round(data.eligible.reduce((s, a) => s + a.scorePercent, 0) / data.eligible.length)
      : 0,
    assessmentCount: data.eligible.length,
    simulationCompletionPercent: percent(simulationsDone.size, data.simulations.length),
    simulationActivityCount: data.sessions.length,
    codingOutcomeCounts,
    codingCorrectCount: correct.length,
    codingTestPassRatePercent: percent(
      conclusive.reduce((s, c) => s + c.results.filter((r) => r.passed).length, 0),
      conclusive.reduce((s, c) => s + c.results.length, 0),
    ),
    predictionAccuracyPercent: percent(
      answered.filter((p) => p.firstCorrect).length,
      answered.length,
    ),
    predictionCount: answered.length,
    weakTopicIds: data.rows.filter((r) => r.masteryBand === 'WEAK').map((r) => r.topicId),
    misconceptions: summarizeMistakes(data).map(({ sources, kinds, evidenceIds, ...r }) => r),
  };
  const recentActivity = [
    ...data.eligible.map((v) => ({ ...v, activityKind: 'ASSESSMENT' })),
    ...data.sessions.map((v) => ({ ...v, activityKind: 'SIMULATION' })),
    ...data.codingAttempts.map((v) => ({ ...v, activityKind: 'CODING' })),
    ...data.predictions.map((v) => ({ ...v, activityKind: 'PREDICTION' })),
  ]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 20)
    .map((v) => ({
      id: asId(v),
      sessionId: v.sessionId ? String(v.sessionId) : null,
      topicId: String(v.topicId),
      title: data.rows.find((r) => sameId(r.topicId, v.topicId))?.title,
      activityKind: v.activityKind,
      status: v.status,
      updatedAt: v.updatedAt,
      scorePercent: v.scorePercent ?? null,
      cursor: v.cursor ?? null,
      correct: v.correct ?? v.firstCorrect ?? null,
      sourceMode: 'REAL',
    }));
  const recommendation = subjectId
    ? recommendationPublic(
        await M.recommendations.findOne({
          userId: user._id,
          status: 'ACTIVE',
          topicId: { $in: data.topics.map((t) => t._id) },
        }),
      )
    : await recomputeRecommendation(user, data);
  return {
    overallCompletionPercent: data.rows.length
      ? round(data.rows.reduce((s, r) => s + r.completionPercent, 0) / data.rows.length)
      : 0,
    subjects,
    topics: data.rows.map(progressPublic),
    metrics,
    recentActivity,
    recommendations: recommendation ? [recommendation] : [],
    calculatedAt: new Date(),
  };
}
