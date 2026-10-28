import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync(path.join(root, 'backend/.env')))
  process.loadEnvFile(path.join(root, 'backend/.env'));
process.env.NODE_ENV = 'development';
await mkdir(path.join(root, '.data'), { recursive: true });
let runtime;
const credentialsPath = path.join(root, '.data/dev-credentials.json');
try {
  runtime = JSON.parse(await readFile(credentialsPath, 'utf8'));
} catch {
  const secret = () => crypto.randomBytes(18).toString('base64url') + '9a';
  runtime = {
    jwtSecret: crypto.randomBytes(48).toString('base64url'),
    studentPassword: secret(),
    facultyPassword: secret(),
    adminPassword: secret(),
  };
  await writeFile(credentialsPath, JSON.stringify(runtime, null, 2));
}
process.env.JWT_SECRET ||= runtime.jwtSecret;
process.env.EXECUTION_MODE ||= 'UNAVAILABLE';
process.env.FRONTEND_ORIGIN ||= 'http://127.0.0.1:5173';
let mongo;
if (!process.env.MONGODB_URI) {
  process.env.MONGOMS_DOWNLOAD_DIR = path.join(root, '.data/mongodb-binaries');
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  await mkdir(path.join(root, '.data/mongo'), { recursive: true });
  console.log('Starting a real MongoDB7 development replica set; first run may download MongoDB.');
  mongo = await MongoMemoryReplSet.create({
    binary: { version: '7.0.14' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ dbPath: path.join(root, '.data/mongo') }],
  });
  process.env.MONGODB_URI = mongo.getUri('trace_dev');
}
const mongoose = (await import('mongoose')).default;
await mongoose.connect(process.env.MONGODB_URI);
const { M } = await import('../backend/src/models.js');
for (const model of Object.values(M)) await model.createIndexes();
const { seedDatabase } = await import('../backend/src/seed.js');
await seedDatabase({ ...runtime, baseTime: new Date() });
await mongoose.disconnect();
await writeFile(
  path.join(root, '.data/dev-session.json'),
  JSON.stringify({
    apiUrl: 'http://127.0.0.1:3000/api/v1',
    webUrl: 'http://127.0.0.1:5173',
    mongoUri: process.env.MONGODB_URI,
  }),
);
console.log('\nLocal development accounts (generated locally; never included in browser bundles):');
console.log(
  `Students: student-a@example.invalid / student-b@example.invalid / student-c@example.invalid\nPassword: ${runtime.studentPassword}\nFaculty: faculty-a@example.invalid / faculty-b@example.invalid\nPassword: ${runtime.facultyPassword}\nAdministrator: admin@example.invalid\nPassword: ${runtime.adminPassword}\n`,
);
const children = [
  spawn(process.execPath, ['--watch', 'src/server.js'], {
    cwd: path.join(root, 'backend'),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
    { cwd: path.join(root, 'frontend'), env: process.env, stdio: 'inherit', windowsHide: true },
  ),
];
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  if (mongo) await mongo.stop();
  process.exit(0);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children)
  child.once('exit', () => {
    if (!stopping) stop();
  });
