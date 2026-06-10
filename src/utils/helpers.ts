import { SDKResult } from '../types';

export function createSuccessResult<T>(data: T, message = 'ok'): SDKResult<T> {
  return {
    success: true,
    code: 'SUCCESS',
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function createErrorResult<T>(
  code: string,
  message: string,
  data: T | null = null,
): SDKResult<T> {
  return {
    success: false,
    code,
    message,
    data: data as T,
    timestamp: new Date().toISOString(),
  };
}

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}`;
}
