import mongoose from 'mongoose';
import { config, validateConfig } from './config.js';
import { M } from './models.js';
import { seedDatabase } from './seed.js';
validateConfig();
if (process.env.ALLOW_DEV_SEED !== 'true') throw Error('Explicit ALLOW_DEV_SEED=true is required');
await mongoose.connect(config.mongoUri);
for (const model of Object.values(M)) await model.createIndexes();
await seedDatabase({
  studentPassword: process.env.SEED_STUDENT_PASSWORD,
  facultyPassword: process.env.SEED_FACULTY_PASSWORD,
  adminPassword: process.env.SEED_ADMIN_PASSWORD,
  baseTime: new Date(process.env.SEED_BASE_TIME || Date.now()),
});
console.log(
  'Development curriculum initialized. Synthetic history is excluded from real progress.',
);
await mongoose.disconnect();
