import { SourceServiceError } from "./errors.js";
import type { SourceName } from "./errors.js";

export type JsonObject = Record<string, unknown>;

export function requireObject(
  value: unknown,
  source: SourceName,
  path: string
): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw schemaError(source, `${path} must be an object.`);
  }
  return value as JsonObject;
}

export function requireString(
  value: unknown,
  source: SourceName,
  path: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw schemaError(source, `${path} must be a non-empty string.`);
  }
  return value;
}

export function requireArray(
  value: unknown,
  source: SourceName,
  path: string
): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw schemaError(source, `${path} must be an array.`);
  }
  return value;
}

export function schemaError(
  source: SourceName,
  message: string
): SourceServiceError {
  return new SourceServiceError("SOURCE_SCHEMA_ERROR", source, message);
}
