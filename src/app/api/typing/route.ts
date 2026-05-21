import { NextResponse } from 'next/server';
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '',
  useTLS: true,
});

export async function POST(request: Request) {
  try {
    const { sender, receiver, isTyping } = await request.json();

    await pusher.trigger('chat-room', 'user-typing', {
      sender: sender.toLowerCase().trim(),
      receiver: receiver.toLowerCase().trim(),
      isTyping,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to broadcast interaction signal' }, { status: 500 });
  }
}