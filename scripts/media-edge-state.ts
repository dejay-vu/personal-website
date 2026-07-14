export type ApprovedSourceState = 'baseline' | 'target';

export function getDriftSourceState(
  liveState: ApprovedSourceState,
  developmentState: ApprovedSourceState,
) {
  if (liveState === 'target' && developmentState !== 'target') {
    throw new Error(
      'CloudFront DEVELOPMENT unexpectedly differs from the published target.',
    );
  }

  // CloudFormation evaluates the mutable DEVELOPMENT configuration. A target
  // staged there is an approved resumable state even while LIVE is baseline.
  return developmentState;
}
