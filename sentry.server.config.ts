// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://3aaff28d57189fe7681864881deeaafe@o4511690460561408.ingest.us.sentry.io/4511690461544448',

  // Keep server traces available without sampling every production request.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
