import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

type ContactAttachmentsStackProps = StackProps & {
  lifecycleExpirationDays: number;
};

export class ContactAttachmentsStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ContactAttachmentsStackProps,
  ) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'ContactAttachmentsBucket', {
      autoDeleteObjects: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          expiration: Duration.days(props.lifecycleExpirationDays),
          prefix: 'private/contact/',
        },
      ],
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: false,
    });

    new CfnOutput(this, 'ContactAttachmentsBucketName', {
      value: bucket.bucketName,
    });
  }
}
