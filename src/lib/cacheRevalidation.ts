export function runCacheRevalidation(revalidate: () => void) {
  try {
    revalidate();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('static generation store missing')
    ) {
      return;
    }

    throw error;
  }
}
