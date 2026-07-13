import { cache } from 'react';

import { getServerSession } from 'next-auth';

import { authOptions } from '../auth.config';

export const auth = () => getServerSession(authOptions);

export const authCached = cache(() => auth().catch(() => null));
