'use client';

import { signIn } from 'next-auth/react';

import { Button, Card } from '@heroui/react';

import { GitHubIcon } from '@/components/ui';

export function AdminLogin() {
  return (
    <section className="mx-auto grid min-h-[calc(100dvh-14rem)] w-full max-w-md place-items-center">
      <Card className="w-full border border-foreground/10 bg-background">
        <Card.Header className="flex flex-col items-start gap-2 p-6">
          <Card.Title className="text-xl font-semibold text-foreground">
            Owner login
          </Card.Title>
          <Card.Description className="text-sm text-foreground/70">
            Sign in with the GitHub account allowed for this site.
          </Card.Description>
        </Card.Header>
        <Card.Footer className="p-6 pt-0">
          <Button
            className="w-full"
            variant="primary"
            onPress={() => signIn('github', { callbackUrl: '/admin' })}
          >
            <GitHubIcon />
            Continue with GitHub
          </Button>
        </Card.Footer>
      </Card>
    </section>
  );
}
