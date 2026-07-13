## Summary

<!-- Explain the outcome and why the change is needed. -->

## Verification

- [ ] Public-tree and naming checks pass
- [ ] Formatting, lint, and typecheck pass
- [ ] Unit tests pass
- [ ] Integration tests pass, or are not applicable
- [ ] Browser tests pass, or are not applicable
- [ ] Production build passes

## Operational impact

- [ ] No database change
- [ ] Migration is additive, committed, replay-tested, and rollout-compatible
- [ ] No AWS/CDK change
- [ ] `cdk synth` and reviewed `cdk diff` cover the infrastructure change
- [ ] Persisted S3 key shapes are unchanged, or `storageLayoutVersion` and the compatibility/migration plan are updated
- [ ] No Vercel environment change
- [ ] Rollout and rollback constraints are documented

## Privacy and repository boundary

- [ ] No credentials, production data, local tooling material, or development-session notes are included
- [ ] Any new public documentation is explicitly allowlisted
