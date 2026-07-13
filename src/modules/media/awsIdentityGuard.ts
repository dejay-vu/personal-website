export function assertExpectedNonRootAwsIdentity({
  actualAccount,
  actualArn,
  expectedAccount,
  expectedPrincipalArnPrefix,
}: {
  actualAccount?: string;
  actualArn?: string;
  expectedAccount: string;
  expectedPrincipalArnPrefix: string;
}) {
  const normalizedPrincipalPrefix = expectedPrincipalArnPrefix.replace(
    /\/+$/,
    '',
  );

  if (!/^\d{12}$/.test(expectedAccount)) {
    throw new Error('AWS_EXPECTED_ACCOUNT_ID must be a 12-digit account ID.');
  }
  if (
    !normalizedPrincipalPrefix.startsWith('arn:aws:') ||
    !normalizedPrincipalPrefix.includes(`::${expectedAccount}:`) ||
    normalizedPrincipalPrefix.endsWith(':root')
  ) {
    throw new Error(
      'AWS_MAINTENANCE_PRINCIPAL_ARN_PREFIX must identify a non-root principal in the expected account.',
    );
  }
  if (
    actualAccount !== expectedAccount ||
    !actualArn ||
    actualArn.endsWith(':root') ||
    (actualArn !== normalizedPrincipalPrefix &&
      !actualArn.startsWith(`${normalizedPrincipalPrefix}/`))
  ) {
    throw new Error(
      'AWS identity does not match the expected non-root maintenance principal.',
    );
  }
}
