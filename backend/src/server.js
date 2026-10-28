import mongoose from 'mongoose';
import { config, validateConfig } from './config.js';
import { M } from './models.js';
import { createApp } from './app.js';
import { processCodingJobs } from './coding.js';
import { expireAssessments } from './learning.js';
import { cleanup } from './maintenance.js';
validateConfig();
await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
for (const model of Object.values(M)) await model.createIndexes();
const server = createApp().listen(config.port, config.production ? '0.0.0.0' : '127.0.0.1', () =>
  console.log(`Cerebro API ready at http://127.0.0.1:${config.port}/api/v1`),
);
const safe = (fn) => () =>
  fn().catch((e) =>
    console.error(JSON.stringify({ event: 'maintenance_failure', errorType: e.name })),
  );
const timers = [
  setInterval(safe(processCodingJobs), 2000),
  setInterval(safe(expireAssessments), 15000),
  setInterval(safe(cleanup), 86400000),
];
safe(cleanup)();
async function shutdown() {
  timers.forEach(clearInterval);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
