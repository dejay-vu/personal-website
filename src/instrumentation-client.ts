// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://3aaff28d57189fe7681864881deeaafe@o4511690460561408.ingest.us.sentry.io/4511690461544448',

  // @sentry/nextjs adds BrowserTracing by default even without a sample rate.
  // Keep browser error capture while avoiding client-side tracing work.
  integrations: (defaultIntegrations) =>
    defaultIntegrations.filter(
      (integration) => integration.name !== 'BrowserTracing',
    ),

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
