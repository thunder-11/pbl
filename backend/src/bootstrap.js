import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config, validateConfig } from './config.js';
import { M } from './models.js';
import { seedDatabase, seedId } from './seed.js';
import { email, password } from './utils.js';
validateConfig();
await mongoose.connect(config.mongoUri);
try {
  for (const model of Object.values(M)) await model.createIndexes();
  if (process.argv[2] === 'admin') {
    if (await M.users.exists({ role: 'ADMIN' }))
      throw Error('An administrator already exists. Use account management.');
    const address = email.parse(process.env.ADMIN_EMAIL),
      secret = password.parse(process.env.ADMIN_PASSWORD),
      displayName = process.env.ADMIN_NAME || 'Department administrator';
    await mongoose.connection.transaction(async (session) => {
      const [admin] = await M.users.create(
        [
          {
            _id: seedId('admin'),
            email: address,
            displayName,
            passwordHash: await bcrypt.hash(secret, 12),
            role: 'ADMIN',
            academicYear: null,
            subjectIds: [],
          },
        ],
        { session },
      );
      await M.ruleConfigs.create(
        [{ version: 1, isActive: true, thresholds: {}, misconceptions: [], createdBy: admin._id }],
        { session },
      );
    });
    console.log('Initial administrator provisioned. No password was logged.');
  } else if (process.argv[2] === 'curriculum') {
    await seedDatabase({ productionContentOnly: true });
    console.log(
      'Curriculum initialized. Demo accounts and synthetic learner histories were not created.',
    );
  } else throw Error('Choose admin or curriculum bootstrap.');
} finally {
  await mongoose.disconnect();
}
