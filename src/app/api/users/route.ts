import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Get all registered accounts for the contact sidebar
export async function GET() {
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('username')
      .order('username', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ users: profiles || [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch directory' }, { status: 500 });
  }
}

// Seamless Login/Signup: Auth check or register automatically
export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    const cleanName = username.toLowerCase().trim();

    if (!cleanName) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', cleanName)
      .single();

    if (!existingUser) {
      // Create new account row dynamically
      const { error: insertError } = await supabase
        .from('profiles')
        .insert([{ username: cleanName }]);
      
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, username: cleanName }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Authentication processing failure' }, { status: 500 });
  }
}