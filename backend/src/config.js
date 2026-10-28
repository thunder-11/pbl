import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
export const config = {
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI,
  secret: process.env.JWT_SECRET,
  issuer: process.env.JWT_ISSUER || 'cerebro-api',
  audience: process.env.JWT_AUDIENCE || 'cerebro-web',
  origin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173',
  executionMode: process.env.EXECUTION_MODE || 'UNAVAILABLE',
  providerVerified: process.env.PROVIDER_CAPABILITIES_VERIFIED === 'true',
  providerUrl: process.env.JUDGE0_BASE_URL,
  providerKey: process.env.JUDGE0_API_KEY,
  providerHeader: process.env.JUDGE0_AUTH_HEADER || 'X-Auth-Token',
};
export function allowedOrigins() {
  const localOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
  return !config.production && localOrigins.includes(config.origin)
    ? localOrigins
    : [config.origin];
}
export function validateConfig() {
  if (!config.mongoUri || !config.secret || config.secret.length < 32)
    throw Error(
      'MONGODB_URI and JWT_SECRET (32+ characters) are required. Use npm run dev for local setup.',
    );
  if (!['REAL', 'MOCK', 'UNAVAILABLE'].includes(config.executionMode))
    throw Error('Invalid EXECUTION_MODE');
  if (config.production && !config.origin.startsWith('https://'))
    throw Error('Production FRONTEND_ORIGIN must use HTTPS');
}
