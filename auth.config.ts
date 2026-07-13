import type { DefaultSession, NextAuthOptions } from 'next-auth';
import GitHub from 'next-auth/providers/github';

import { isAdminGithubId } from '@/lib/adminAuth';

const authUrl =
  process.env.NEXTAUTH_URL ??
  process.env.AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined);

if (authUrl) {
  process.env.NEXTAUTH_URL = authUrl;
}

declare module 'next-auth' {
  interface User {
    githubId?: string;
  }
  interface Session extends DefaultSession {
    /**
     * By default, TypeScript merges new interface properties and overwrites existing ones.
     * In this case, the default session user properties will be overwritten,
     * with the new ones defined above. To keep the default session user properties,
     * we need to add them back into the newly declared interface.
     */
    user: DefaultSession['user'] & {
      githubId?: string;
      isAdmin?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    githubId?: string;
  }
}

export const authConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID ?? '',
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? '',
      profile(profile) {
        const githubId = String(profile.id);

        return {
          id: githubId,
          githubId,
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.githubId = user.githubId ?? user.id;
        token.picture = user.image;
      }
      return token;
    },
    session({ session, token }) {
      session.user.image = token.picture as string;
      session.user.githubId = token.githubId;
      session.user.isAdmin = isAdminGithubId(token.githubId);
      return session;
    },
  },
} satisfies NextAuthOptions;

export const authOptions = authConfig;
