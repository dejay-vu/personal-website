# AWS infrastructure and storage structure contract

This repository manages only the Contact attachment stack. The existing media
pipeline is represented by the committed read-only contract in
`infra/external-media-contract.json`; this CDK app does not deploy or import it.
The one reviewed exception is the exact CloudFront viewer-request Function
source in `infra/cloudfront/url-rewrite-function.js`, which can be verified or
patched with the guarded commands below without redeploying its owner stack.

## Ownership

| Resource                                                            | Ownership                         | Contract                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Contact attachment bucket and policy                                | `ContactAttachmentsStack`         | Private, S3-managed encryption, TLS-only, `private/contact/` expires after 30 days, unversioned, retained on stack deletion. |
| Transformed bucket, image Lambda, resizer CloudFront, and IAM roles | External `ImgTransformationStack` | Identity and critical configuration are recorded in the external contract.                                                   |
| Original bucket and originals CloudFront                            | External, not in CloudFormation   | Identity and observed configuration are recorded in the external contract.                                                   |
| Website runtime IAM principal                                       | External                          | Must be a dedicated least-privilege identity, never an account root key.                                                     |

`MediaImageTransformationConfigStack` was removed because it was never deployed
and the real `ImgTransformationStack` already owns those resources. Deploying a
second custom resource could replace the image Lambda's complete environment
map and create conflicting ownership.

## Structure version model

S3 has no database-style schema. This project versions its persisted key layout
as an application contract instead:

- `STORAGE_LAYOUT_VERSION` in `src/modules/media/storageKeys.ts` is the code
  source of truth.
- `storageLayoutVersion` in `infra/external-media-contract.json` must equal it.
- Contract `publicHost` values must match the credential-free defaults in
  `src/modules/media/publicConfig.ts`; deployment variables may deliberately
  override those URLs without becoming required for a clean build.
- The current stable namespaces are `media/photos/`, `media/notes/`,
  `media/projects/`, and `staging/uploads/`.
- Public labels and URLs such as Darkroom or Field Notes never appear in storage
  identities and do not change the layout version.

Increment the layout version only when a persisted key shape or namespace
changes. The same change must include backward-compatible reads or a reviewed
migration, updated golden key tests, and a contract update. Ordinary code
releases, slug changes, bucket object contents, and public venue renames do not
increment it.

Git tag `v0.1.0` therefore maps to, rather than duplicates, the independent
structure truths:

- the exact Git commit and tree;
- the committed Prisma migration head and checksums;
- storage layout version `1`;
- the Contact CDK template checksum;
- the external media contract checksum.

No version-named bucket, database, S3 marker object, application-version table,
or per-object layout version is required.

## Object Versioning is independent

S3 Object Versioning controls recovery of object bytes; it is not the storage
layout version. The contract records the observed bucket state for audit, but a
specific `Enabled` or `Suspended` state is not a code-release prerequisite.

Admin purge has an explicit product meaning: it removes the database record and
queues deletion of every original version/delete marker for that immutable key,
then clears transformed cache objects. This behavior remains correct whether
the original bucket currently has Object Versioning enabled or suspended. It
does not require a global history cleanup during a code release.

## Local verification

The structural checks are credential-free:

```bash
corepack npm run check:aws-contract
corepack npm run infra:synth
node --import tsx --test tests/unit/infraContracts.test.ts tests/unit/awsContract.test.ts tests/unit/storageKeys.test.ts
```

The synth must contain only `ContactAttachmentsStack`. Before its rare manual
deployment, inspect its CloudFormation change explicitly:

```bash
corepack npm run cdk -- diff ContactAttachmentsStack
```

Do not import or deploy external media resources as part of an application
release.

## Media edge Function

The transformed-image distribution uses an externally owned CloudFront
Function to normalize image transformation parameters. Its committed source
retains the original Amazon MIT-0 header and adds an origin-free response for
the exact `/robots.txt` path. `GET` returns the crawler allow policy and `HEAD`
returns the same status and headers without a body; query parameters do not
change that response.

The non-deploying verification command checks the AWS account, non-root caller,
distribution association, Function name/runtime, approved source hashes, and a
fresh CloudFormation drift report:

```bash
AWS_PROFILE=dejayvu corepack npm run media:edge:verify
```

The write command is deliberately narrower than a stack deployment. It is
permitted only from a clean local `main` that exactly matches the current
remote `main`. It accepts only the recorded baseline or target source hash,
updates DEVELOPMENT, runs the Function contract tests there, and publishes to
LIVE only after they pass:

```bash
AWS_PROFILE=dejayvu corepack npm run media:edge:apply
```

Run `media:edge:apply` only after the source and contract commit is merged to
`main`. Never use this as authorization to run the repository CDK app or deploy
`ImgTransformationStack`. The drift gate allows the recorded image Lambda
`maxImageSize` difference. Once the Function target is live, it additionally
allows only that Function's `/FunctionCode` difference; every other drift
blocks verification and publication.

## Read-only live audit

Run live checks only with the expected account and region. Store output in
private operational evidence, never in Git or a public release artifact:

```bash
aws sts get-caller-identity

aws s3api get-bucket-versioning --bucket "$S3_BUCKET_NAME"
aws s3api get-bucket-versioning --bucket "$TRANSFORMED_IMAGE_BUCKET_NAME"

aws cloudfront get-distribution --id "$CLOUDFRONT_ORIGINALS_DISTRIBUTION_ID"
aws cloudfront get-distribution --id "$CLOUDFRONT_TRANSFORMED_DISTRIBUTION_ID"

aws lambda get-function-configuration \
  --function-name "$(node -p "require('./infra/external-media-contract.json').imageOptimization.functionName")"
```

Compare resource identities and critical mappings with the committed contract.
The runtime identity must be a dedicated least-privilege IAM principal. Account
root access keys remain a release blocker regardless of the S3 Object
Versioning policy.

## Runtime permissions

The media runtime identity needs only the object paths and distributions used by
the application. Permanent Admin purge additionally requires:

- `s3:ListBucketVersions` on the original bucket;
- `s3:DeleteObjectVersion` on original media objects;
- `cloudfront:CreateInvalidation` on the two recorded distributions.

The owner-only runtime health endpoint additionally requires `s3:ListBucket` on
the original and transformed bucket ARNs. Keep that grant constrained to the
exact `media/health-check/` prefix and requests with `s3:max-keys` no greater
than `1`; it must not grant object reads or unrestricted bucket listing.

## Contact deployment

Contact infrastructure remains a manual maintenance operation after a reviewed
diff:

```bash
corepack npm run cdk -- deploy ContactAttachmentsStack
```

The generated bucket has `RETAIN`; recreating the stack can therefore produce a
new bucket. Update `CONTACT_S3_BUCKET_NAME` deliberately from the stack output.
This command is not part of CI or the normal application release workflow.
