import bcrypt from 'bcryptjs';
import { M, transaction } from './models.js';
import { randomSecret } from './utils.js';
import { audit } from './auth.js';
export async function cleanup() {
  const cutoff = new Date(Date.now() - 365 * 86400000);
  // Learning evidence follows the student throughout the degree. Only transient
  // recommendations expire automatically; account deletion purges all personal data.
  await M.recommendations.deleteMany({ createdAt: { $lt: cutoff } });
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
            studentProfile: {},
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
