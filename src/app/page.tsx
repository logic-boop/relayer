'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Sun, Moon, MessageCircle, Send, LogOut, Phone, Video, Info, Circle, Menu } from 'lucide-react';
import Pusher from 'pusher-js';

interface Contact {
  id: string;
  name: string;
  status: string;
  avatar: string;
}

interface Message {
  id: string;
  sender: string;
  receiver: string;
  text: string;
  timestamp: string;
}

type ChatHistory = Record<string, Message[]>;

const MOCK_CONTACTS: Contact[] = [
  { id: '1', name: 'frank', status: 'Active now', avatar: 'F' },
  { id: '2', name: 'jemad', status: 'Away', avatar: 'J' },
  { id: '3', name: 'diva', status: 'Active 5m ago', avatar: 'D' },
  { id: '4', name: 'tosin', status: 'Active now', avatar: 'T' },
];

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  const [newMessageText, setNewMessageText] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory>({});
  
  // Option C: Tracking typing state indicators
  const [partnerTyping, setPartnerTyping] = useState<Record<string, boolean>>({});
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const isCurrentlyTypingSent = useRef(false);

  const contacts = useMemo(() => {
    return MOCK_CONTACTS.filter((contact) => contact.name !== currentUser);
  }, [currentUser]);

  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeContact && contacts.length > 0) setActiveContact(contacts[0]);
  }, [contacts, activeContact]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, activeContact, partnerTyping]);

  // Initial Sync Logic on mount
  useEffect(() => {
    setHasMounted(true);
    document.documentElement.classList.add('dark');
    const session = localStorage.getItem('relayer_session');
    if (session) {
      const activeUser = session.toLowerCase().trim();
      setCurrentUser(activeUser);
      fetchCloudHistory(activeUser);
    }
  }, []);

  // Fetch real database records from Supabase via Next.js backend pipeline
  const fetchCloudHistory = async (user: string) => {
    try {
      const res = await fetch(`/api/messages?user=${user}`);
      const data = await res.json();
      if (data.history) setChatHistory(data.history);
    } catch (err) {
      console.error('Failed fetching database cloud logs:', err);
    }
  };

  // Real-time Event Subscription Binders
  useEffect(() => {
    if (!currentUser) return;

    const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY || 'da98c015f810224280c0', {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
    });

    const channel = pusherClient.subscribe('chat-room');

    // Handle Incoming Messages
    channel.bind('new-message', (incomingMessage: Message) => {
      if (incomingMessage.receiver !== currentUser || incomingMessage.sender === currentUser) return;

      setChatHistory((prev) => {
        const partner = incomingMessage.sender;
        const currentThread = prev[partner] || [];
        if (currentThread.some((m) => m.id === incomingMessage.id)) return prev;
        return { ...prev, [partner]: [...currentThread, incomingMessage] };
      });
    });

    // Handle Incoming Typing Indicators (Option C)
    channel.bind('user-typing', (data: { sender: string; receiver: string; isTyping: boolean }) => {
      if (data.receiver !== currentUser) return;
      
      setPartnerTyping((prev) => ({ ...prev, [data.sender]: data.isTyping }));

      // Fallback timeout to clear state if the user stops typing abruptly or disconnects
      if (data.isTyping) {
        if (typingTimeoutRef.current[data.sender]) clearTimeout(typingTimeoutRef.current[data.sender]);
        typingTimeoutRef.current[data.sender] = setTimeout(() => {
          setPartnerTyping((prev) => ({ ...prev, [data.sender]: false }));
        }, 3000);
      }
    });

    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe('chat-room');
      pusherClient.disconnect();
    };
  }, [currentUser]);

  // Transmit Typing State Changes (Option C)
  const sendTypingSignal = async (isTyping: boolean) => {
    if (!currentUser || !activeContact || isCurrentlyTypingSent.current === isTyping) return;
    isCurrentlyTypingSent.current = isTyping;

    try {
      await fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: currentUser, receiver: activeContact.name, isTyping }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleInputChange = (text: string) => {
    setNewMessageText(text);
    if (text.trim().length > 0) {
      sendTypingSignal(true);
      // Automatically toggle typing state off after 2 seconds of silence
      const timer = setTimeout(() => sendTypingSignal(false), 2000);
      return () => clearTimeout(timer);
    } else {
      sendTypingSignal(false);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setIsLoading(true);
    const sanitizedUser = username.toLowerCase().trim();
    localStorage.setItem('relayer_session', sanitizedUser);
    setCurrentUser(sanitizedUser);
    fetchCloudHistory(sanitizedUser);
    setIsLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('relayer_session');
    setCurrentUser(null);
    setUsername('');
    setPassword('');
    setActiveContact(null);
    setChatHistory({});
  };

  const handleSendMessage = async () => {
    if (!newMessageText.trim() || !currentUser || !activeContact) return;

    sendTypingSignal(false); // Kill typing signal instantly on submit
    const typedText = newMessageText.trim();
    const targetPartner = activeContact.name;

    const messagePayload: Message = {
      id: crypto.randomUUID(),
      sender: currentUser,
      receiver: targetPartner,
      text: typedText,
      timestamp: new Date().toISOString(),
    };

    setChatHistory((prev) => ({
      ...prev,
      [targetPartner]: [...(prev[targetPartner] || []), messagePayload],
    }));

    setNewMessageText('');

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messagePayload),
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (!hasMounted) return <div className="h-screen w-full bg-zinc-950" />;

  const activeMessages = activeContact ? chatHistory[activeContact.name] || [] : [];
  const isPartnerTypingNow = activeContact ? partnerTyping[activeContact.name] : false;

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 text-zinc-100 antialiased">
      {!currentUser ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-950">
          <div className="w-full max-w-md bg-zinc-900 p-8 rounded-3xl border border-zinc-800">
            <div className="flex flex-col items-center mb-6">
              <div className="bg-blue-600 p-3.5 rounded-2xl text-white mb-3 shadow-md shadow-blue-500/20">
                <MessageCircle size={32} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Log into Relayer</h2>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-zinc-400">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-zinc-700 bg-transparent text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. tosin or frank" required />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1 text-zinc-400">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-zinc-700 bg-transparent text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl mt-2 transition disabled:opacity-50 cursor-pointer">
                {isLoading ? 'Connecting...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {mobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-40 sm:hidden" />}

          {/* Sidebar */}
          <aside className={`fixed sm:relative top-0 left-0 h-full w-80 bg-zinc-900 border-r border-zinc-800/80 flex flex-col transition-transform duration-300 z-50 sm:translate-x-0 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm uppercase shrink-0">
                  {currentUser.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-base tracking-tight capitalize truncate block">{currentUser}</span>
                  <p className="text-xs text-green-500 font-medium flex items-center gap-1">
                    <Circle size={6} className="fill-current" /> Active
                  </p>
                </div>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-full text-red-500 hover:bg-red-950/30 cursor-pointer">
                <LogOut size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-zinc-900">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => { setActiveContact(contact); setMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all cursor-pointer ${activeContact?.id === contact.id ? 'bg-blue-950/40 text-blue-400 font-medium' : 'hover:bg-zinc-800/40 text-zinc-300'}`}
                >
                  <div className="w-11 h-11 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center font-bold relative uppercase shrink-0">
                    {contact.avatar}
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-900" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-zinc-100 capitalize">{contact.name}</p>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                      {partnerTyping[contact.name] ? 'typing...' : contact.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* Main Workspace Frame */}
          <main className="flex-1 flex flex-col bg-zinc-950 min-w-0">
            <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setMobileSidebarOpen(true)} className="sm:hidden p-2 rounded-xl text-gray-500 hover:bg-zinc-800 cursor-pointer border border-zinc-800">
                  <Menu size={20} />
                </button>
                <div className="w-10 h-10 rounded-full bg-blue-900/40 text-blue-400 flex items-center justify-center font-bold uppercase shrink-0">
                  {activeContact?.avatar || '?'}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-zinc-100 capitalize truncate">{activeContact?.name || 'Select Room'}</h3>
                  <p className="text-xs text-zinc-400 font-medium flex items-center gap-1 mt-0.5">
                    {isPartnerTypingNow ? (
                      <span className="text-blue-400 animate-pulse font-semibold">is typing...</span>
                    ) : (
                      activeContact?.status || 'Offline'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-blue-400 shrink-0">
                <button className="p-2 rounded-full hover:bg-zinc-800 cursor-pointer"><Phone size={18} /></button>
                <button className="p-2 rounded-full hover:bg-zinc-800 cursor-pointer"><Video size={18} /></button>
                <button className="p-2 rounded-full hover:bg-zinc-800 cursor-pointer"><Info size={18} /></button>
              </div>
            </header>

            {/* Conversation Log viewport */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950">
              {activeMessages.map((msg) => {
                const isMe = msg.sender === currentUser;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] font-semibold text-zinc-500 mb-0.5 px-1 uppercase tracking-wider">
                      {isMe ? 'You' : msg.sender}
                    </span>
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-xs ${
                      isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-zinc-900/90 text-zinc-100 rounded-tl-none border border-zinc-800/60'
                    }`}>
                      <p className="break-words whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
              
              {/* Animated typing bubble context for Option C */}
              {isPartnerTypingNow && (
                <div className="flex flex-col items-start animate-fade-in">
                  <span className="text-[10px] font-semibold text-zinc-500 mb-0.5 px-1 uppercase capitalize">{activeContact?.name}</span>
                  <div className="bg-zinc-900/90 border border-zinc-800/60 text-zinc-100 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <footer className="p-4 border-t border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <input 
                  type="text"
                  value={newMessageText}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={activeContact ? `Message ${activeContact.name}...` : "Select a contact to type"}
                  disabled={!activeContact}
                  className="flex-1 bg-zinc-800 text-zinc-100 px-4 py-2.5 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-zinc-700"
                />
                <button onClick={handleSendMessage} disabled={!newMessageText.trim() || !activeContact} className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-sm cursor-pointer">
                  <Send size={16} className="translate-x-[0.5px]" />
                </button>
              </div>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}