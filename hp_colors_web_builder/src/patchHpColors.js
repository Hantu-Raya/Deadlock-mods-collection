import { coerceHpValue } from "./hpSchema.js";

function formatJsValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function sanitizePresetValues(values) {
  const clean = {};
  Object.keys(values || {}).forEach((key) => {
    const value = coerceHpValue(key, values[key]);
    if (value !== undefined) clean[key] = value;
  });
  return clean;
}

export function patchRegistrarDefaults(source, values) {
  const clean = sanitizePresetValues(values);
  let patched = String(source);

  Object.entries(clean).forEach(([key, value]) => {
    const pattern = new RegExp(`(id:\\s*["']${key}["'][^\\n]*?defaultValue:\\s*)(["'][^"']*["']|true|false|-?\\d+(?:\\.\\d+)?)`);
    patched = patched.replace(pattern, `$1${formatJsValue(value)}`);
  });

  return patched;
}
