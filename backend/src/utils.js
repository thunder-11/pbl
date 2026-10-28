import crypto from 'node:crypto';
import { z } from 'zod';
import { fail } from './errors.js';
export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Use a valid identifier');
export const uuid = z.string().uuid();
export const version = z.number().int().positive();
export const password = z
  .string()
  .min(12)
  .max(64)
  .regex(/[a-z]/i)
  .regex(/\d/)
  .refine((v) => Buffer.byteLength(v) <= 72, 'Password exceeds72 UTF-8 bytes');
export const email = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
export const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(canonical(value)))
    .digest('hex');
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (value?._bsontype === 'ObjectId') return value.toHexString();
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
}
export const randomSecret = () => crypto.randomBytes(32).toString('base64url');
export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const percent = (n, d) => (d ? round((100 * n) / d) : 0);
export const sameId = (a, b) => String(a) === String(b);
export const asId = (value) => String(value?._id || value);
export function cleanObject(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (
      key.startsWith('$') ||
      key.includes('.') ||
      ['__proto__', 'prototype', 'constructor'].includes(key)
    )
      fail(422, 'VALIDATION_ERROR', 'Request contains forbidden properties');
    cleanObject(value[key]);
  }
}
export function pagination(query, filters = [], sorts = ['createdAt']) {
  const allowed = new Set(['page', 'pageSize', 'sort', 'order', ...filters]);
  for (const k of Object.keys(query))
    if (!allowed.has(k)) fail(422, 'VALIDATION_ERROR', 'Query parameter is not supported');
  const page = Number(query.page ?? 1),
    pageSize = Number(query.pageSize ?? 20);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    fail(422, 'INVALID_PAGINATION', 'Pagination parameters are invalid');
  if (
    (query.sort && !sorts.includes(query.sort)) ||
    (query.order && !['asc', 'desc'].includes(query.order))
  )
    fail(422, 'VALIDATION_ERROR', 'Sort is invalid');
  return {
    page,
    pageSize,
    sort: query.sort || sorts[0],
    direction: query.order === 'desc' ? -1 : 1,
  };
}
export function listResult(rows, p) {
  const sorted = [...rows].sort((a, b) => {
    let x = a[p.sort],
      y = b[p.sort];
    return (
      (typeof x === 'string' ? x.localeCompare(y ?? '') : (x ?? 0) - (y ?? 0)) * p.direction ||
      String(a._id).localeCompare(String(b._id)) * p.direction
    );
  });
  return {
    rows: sorted.slice((p.page - 1) * p.pageSize, p.page * p.pageSize),
    meta: { page: p.page, pageSize: p.pageSize, total: rows.length },
  };
}
export const normalizeOutput = (text) =>
  String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '');
export const publicDoc = (doc) => {
  const v = JSON.parse(JSON.stringify(doc?.toObject ? doc.toObject() : doc));
  if (v) {
    v.id = String(v._id);
    delete v._id;
    delete v.__v;
  }
  return v;
};
