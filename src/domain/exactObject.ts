export function hasExactKeys<const Key extends string>(
  value: unknown,
  keys: readonly Key[]
): value is Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key as Key))
  );
}
