import bcrypt from 'bcryptjs';
import { M, transaction } from './models.js';
import { randomSecret } from './utils.js';
import { audit } from './auth.js';
export async function cleanup() {
  const cutoff = new Date(Date.now() - 365 * 86400000);
  for (const kind of [
    'assessmentAttempts',
    'codingAttempts',
    'simulationSessions',
    'recommendations',
    'comparisonRuns',
  ]) {
    const old = await M[kind]
        .find({ createdAt: { $lt: cutoff } })
        .select('_id')
        .limit(1000)
        .lean(),
      ids = old.map((d) => d._id);
    if (!ids.length) continue;
    if (['assessmentAttempts', 'codingAttempts'].includes(kind))
      await M.mistakeEvidence.deleteMany({ sourceId: { $in: ids } });
    if (kind === 'simulationSessions')
      await M.predictionAttempts.deleteMany({ sessionId: { $in: ids } });
    await M[kind].deleteMany({ _id: { $in: ids } });
  }
  await M.topicProgress.updateMany(
    {},
    { $pull: { readConfirmations: { readAt: { $lt: cutoff } } } },
  );
  for (const user of await M.users
    .find({
      status: 'DELETION_PENDING',
      deletionRequestedAt: { $lte: new Date(Date.now() - 7 * 86400000) },
    })
    .limit(100)) {
    await transaction(async (session) => {
      for (const kind of [
        'authSessions',
        'assessmentAttempts',
        'codingAttempts',
        'simulationSessions',
        'predictionAttempts',
        'topicProgress',
        'recommendations',
        'mistakeEvidence',
        'comparisonRuns',
      ])
        await M[kind].deleteMany({ userId: user._id }, { session });
      await M.users.updateOne(
        { _id: user._id, status: 'DELETION_PENDING' },
        {
          $set: {
            email: `${user._id}@deleted.invalid`,
            displayName: 'Deleted user',
            passwordHash: await bcrypt.hash(randomSecret(), 12),
            subjectIds: [],
            academicYear: null,
            status: 'ANONYMIZED',
          },
          $inc: { authVersion: 1, recordVersion: 1 },
        },
        { session },
      );
      await audit(
        null,
        'SYSTEM_DELETE',
        'users',
        user._id,
        'Personal learner records purged and author stub anonymized',
        null,
        session,
      );
    });
  }
}
