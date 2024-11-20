import { NextRequest, NextResponse } from 'next/server';

import { Resend } from 'resend';

import type { ContactEmailSendForm } from '@/lib/definitions';

import EmailToMe from './EmailToMe';
import EmailToUser from './EmailToUser';

export async function POST(request: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { name, email, message, attachments } =
      (await request.json()) as ContactEmailSendForm;

    const userSubject = name
      ? `Thanks for your message, ${name}!`
      : `Thanks for your message!`;

    // send the user's message to me
    const { error } = await resend.emails.send({
      from: 'DeJay Vu <contact@dejayvu.com>',
      to: ['junhao.zhang2301@gmail.com'],
      reply_to: email,
      subject: `New message from ${name || 'Anonymous'}`,
      react: <EmailToMe userEmail={email} userMessage={message} />,
      attachments: attachments?.map((attachment) => {
        return {
          filename: attachment.fileName,
          content: attachment.content.split(',')[1],
        };
      }),
    });

    if (error) {
      return NextResponse.json({ body: String(error.name) }, { status: 500 });
    }
    // send feedback to the user
    const _ = resend.emails.send({
      from: 'DeJay Vu <contact@dejayvu.com>',
      to: [email],
      reply_to: 'junhao.zhang2301@gmail.com',
      subject: userSubject,
      react: <EmailToUser userName={name} userMessage={message} />,
    });

    // wait for 2 second
    // await new Promise((resolve) => setTimeout(resolve, 2000));
    return NextResponse.json({ body: 'Message Sent' }, { status: 200 });
  } catch {
    return NextResponse.error();
  }
}
