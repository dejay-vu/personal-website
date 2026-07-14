function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`CloudFront Function ${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

/**
 * TestFunction wraps viewer-request results in `request` and generated
 * responses in `response`. Keep accepting the direct object as a defensive
 * fallback for SDK/emulator output that has already removed the envelope.
 */
export function parseCloudFrontFunctionOutput(value: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('CloudFront Function test returned invalid JSON.');
  }

  const envelope = requireRecord(parsed, 'test output');

  if (Object.hasOwn(envelope, 'response')) {
    return requireRecord(envelope.response, 'response output');
  }
  if (Object.hasOwn(envelope, 'request')) {
    return requireRecord(envelope.request, 'request output');
  }

  return envelope;
}
