type ExistenceCheckOptions = {
  budgetMs: number;
  logError?: (message: string, error: unknown) => void;
};

// Only a confirmed miss answers false. A slow or failing check lets the page
// decide, so an existence lookup can never hold back or break an existing page.
export async function existsUnlessConfirmedMissing(
  check: () => Promise<boolean>,
  {
    budgetMs,
    logError = (message, error) => console.error(message, error),
  }: ExistenceCheckOptions,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), budgetMs);
  });
  const lookup = check().catch((error: unknown) => {
    logError('Existence check failed; letting the page decide.', error);
    return true;
  });

  try {
    return await Promise.race([lookup, budget]);
  } finally {
    clearTimeout(timer);
  }
}
