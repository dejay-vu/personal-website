type StorageDeletionCronDependencies = {
  cronSecret: string | undefined;
  drain(): Promise<number>;
};

export async function handleStorageDeletionCronRequest(
  request: Request,
  { cronSecret, drain }: StorageDeletionCronDependencies,
) {
  const authorization = request.headers.get('authorization');

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json(
      {
        error: 'Unauthorized',
        ok: false,
      },
      { status: 401 },
    );
  }

  const claimed = await drain();

  return Response.json({
    data: {
      claimed,
    },
    ok: true,
  });
}
