#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { ContactAttachmentsStack } from '../lib/contact-attachments-stack';

const app = new App();

new ContactAttachmentsStack(app, 'ContactAttachmentsStack', {
  env: {
    region: app.node.tryGetContext('region') ?? 'eu-west-2',
  },
  lifecycleExpirationDays: Number(
    app.node.tryGetContext('contactAttachmentExpirationDays') ?? 30,
  ),
});
