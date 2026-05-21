import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Pusher from 'pusher';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '',
  useTLS: true,
});

// 1. GET: Pull authentic historical records from Postgres database
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const user = searchParams.get('user')?.toLowerCase().trim();

  if (!user) {
    return NextResponse.json({ error: 'User parameter required' }, { status: 400 });
  }

  try {
    // Query rows where the user is either the sender OR the receiver
    const { data: records, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender.eq.${user},receiver.eq.${user}`)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // Group the messages by the conversation partner's name for the client-side state
    const history: Record<string, any[]> = {};
    records?.forEach((msg) => {
      const partner = msg.sender === user ? msg.receiver : msg.sender;
      if (!history[partner]) history[partner] = [];
      history[partner].push(msg);
    });

    return NextResponse.json({ history }, { status: 200 });
  } catch (error) {
    console.error('Database fetch failure:', error);
    return NextResponse.json({ error: 'Failed to retrieve message logs.' }, { status: 500 });
  }
}

// 2. POST: Commit new message packet to database and trigger broadcast channels
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { id, sender, receiver, text, timestamp } = payload;

    if (!sender || !receiver || !text) {
      return NextResponse.json({ error: 'Missing required parameters.' }, { status: 400 });
    }

    const cleanMessage = {
      id: id || crypto.randomUUID(),
      sender: sender.toLowerCase().trim(),
      receiver: receiver.toLowerCase().trim(),
      text: text.trim(),
      timestamp: timestamp || new Date().toISOString(),
    };

    // Commit to persistent table architecture
    const { error: dbError } = await supabase.from('messages').insert([cleanMessage]);
    if (dbError) throw dbError;

    // Stream out live real-time network update
    await pusher.trigger('chat-room', 'new-message', cleanMessage);

    return NextResponse.json({ success: true, message: cleanMessage }, { status: 200 });
  } catch (error) {
    console.error('Routing processing exception:', error);
    return NextResponse.json({ error: 'Internal pipeline failure' }, { status: 500 });
  }
}