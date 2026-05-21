'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, LogOut, Phone, Video, Info, Circle, Menu, X } from 'lucide-react';
import Pusher from 'pusher-js';

interface Contact {
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

export default function Home() {
  const [hasMounted, setHasMounted] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  const [newMessageText, setNewMessageText] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  
  const [partnerTyping, setPartnerTyping] = useState<Record<string, boolean>>({});
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const isCurrentlyTypingSent = useRef(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, activeContact, partnerTyping]);

  useEffect(() => {
    setHasMounted(true);
    const session = localStorage.getItem('relayer_session');
    if (session) {
      const activeUser = session.toLowerCase().trim();
      setCurrentUser(activeUser);
      bootstrapSession(activeUser);
    }
  }, []);

  const bootstrapSession = async (user: string) => {
    await fetchDirectory(user);
    await fetchCloudHistory(user);
  };

  // Fetch real registered dynamic profiles from Supabase
  const fetchDirectory = async (current: string) => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.users) {
        const mapped: Contact[] = data.users
          .filter((u: any) => u.username !== current)
          .map((u: any) => ({
            name: u.username,
            status: 'Registered User',
            avatar: u.username.charAt(0).toUpperCase()
          }));
        setContacts(mapped);
        if (mapped.length > 0 && !activeContact) {
          setActiveContact(mapped[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCloudHistory = async (user: string) => {
    try {
      const res = await fetch(`/api/messages?user=${user}`);
      const data = await res.json();
      if (data.history) setChatHistory(data.history);
    } catch (err) {
      console.error(err);
    }
  };

  // Pusher Real-Time listeners
  useEffect(() => {
    if (!currentUser) return;

    const pusherClient = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY || 'da98c015f810224280c0', {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
    });

    const channel = pusherClient.subscribe('chat-room');

    channel.bind('new-message', (incomingMessage: Message) => {
      if (incomingMessage.receiver !== currentUser && incomingMessage.sender !== currentUser) return;

      setChatHistory((prev) => {
        const partner = incomingMessage.sender === currentUser ? incomingMessage.receiver : incomingMessage.sender;
        const currentThread = prev[partner] || [];
        if (currentThread.some((m) => m.id === incomingMessage.id)) return prev;
        return { ...prev, [partner]: [...currentThread, incomingMessage] };
      });
    });

    channel.bind('user-typing', (data: { sender: string; receiver: string; isTyping: boolean }) => {
      if (data.receiver !== currentUser) return;
      setPartnerTyping((prev) => ({ ...prev, [data.sender]: data.isTyping }));

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
    } else {
      sendTypingSignal(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    const sanitizedUser = username.toLowerCase().trim();

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: sanitizedUser }),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('relayer_session', sanitizedUser);
        setCurrentUser(sanitizedUser);
        await bootstrapSession(sanitizedUser);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('relayer_session');
    setCurrentUser(null);
    setUsername('');
    setPassword('');
    setActiveContact(null);
    setContacts([]);
    setChatHistory({});
  };

  const handleSendMessage = async () => {
    if (!newMessageText.trim() || !currentUser || !activeContact) return;

    sendTypingSignal(false);
    const typedText = newMessageText.trim();
    const targetPartner = activeContact.name;

    const messagePayload: Message = {
      id: crypto.randomUUID(),
      sender: currentUser,
      receiver: targetPartner,
      text: typedText,
      timestamp: new Date().toISOString(),
    };

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
    <div className="h-screen w-full flex flex-col bg-zinc-950 text-zinc-100 antialiased overflow-hidden">
      {!currentUser ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-zinc-950">
          <div className="w-full max-w-sm bg-zinc-900 p-6 sm:p-8 rounded-3xl border border-zinc-800">
            <div className="flex flex-col items-center mb-6">
              <div className="bg-blue-600 p-3 rounded-2xl text-white mb-3">
                <MessageCircle size={28} />
              </div>
              <h2 className="text-xl font-bold tracking-tight">Sign inside Relayer</h2>
              <p className="text-xs text-zinc-400 mt-1 text-center">Enter any username. If it doesn't exist, we will register it instantly!</p>
            </div>
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase block mb-1 text-zinc-400">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-100 outline-none focus:border-blue-500 text-sm" placeholder="e.g. tosin, frank, charity" required />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase block mb-1 text-zinc-400">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-zinc-950 rounded-xl border border-zinc-800 text-zinc-100 outline-none focus:border-blue-500 text-sm" placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition text-sm disabled:opacity-50 cursor-pointer">
                {isLoading ? 'Accessing Secure Pipeline...' : 'Sign In / Register'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative w-full h-full">
          
          {/* Mobile Sidebar Overlay Backdrop */}
          {mobileSidebarOpen && (
            <div onClick={() => setMobileSidebarOpen(false)} className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-xs transition-opacity duration-300" />
          )}

          {/* Fully Responsive Unified Sidebar */}
          <aside className={`fixed md:relative top-0 left-0 h-full w-72 sm:w-80 bg-zinc-900 border-r border-zinc-800/80 flex flex-col transition-transform duration-300 ease-in-out z-50 md:translate-x-0 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm uppercase shrink-0">
                  {currentUser.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-sm tracking-tight capitalize truncate block">{currentUser}</span>
                  <p className="text-[10px] text-green-500 font-medium flex items-center gap-1"><Circle size={5} className="fill-current" /> Online</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setMobileSidebarOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400">
                  <X size={18} />
                </button>
                <button onClick={handleLogout} className="p-1.5 rounded-lg text-red-500 hover:bg-red-950/30">
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-zinc-900">
              <p className="text-[10px] font-bold text-zinc-500 uppercase px-3 pt-2 pb-1 tracking-wider">Active Workspace Directory</p>
              {contacts.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">No other users online yet.</p>
              ) : (
                contacts.map((contact) => (
                  <button
                    key={contact.name}
                    onClick={() => { setActiveContact(contact); setMobileSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${activeContact?.name === contact.name ? 'bg-blue-600/10 text-blue-400 font-medium border-l-4 border-blue-500 pl-1.5' : 'hover:bg-zinc-800/40 text-zinc-300'}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center text-sm font-bold uppercase shrink-0">
                      {contact.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate text-zinc-100 capitalize">{contact.name}</p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {partnerTyping[contact.name] ? 'typing...' : contact.status}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Main Chat Area Context viewport */}
          <main className="flex-1 flex flex-col bg-zinc-950 min-w-0 h-full w-full relative">
            <header className="p-3 sm:p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/40 backdrop-blur-md">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setMobileSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-zinc-800 border border-zinc-800">
                  <Menu size={18} />
                </button>
                <div className="w-9 h-9 rounded-full bg-blue-900/40 text-blue-400 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                  {activeContact?.avatar || '?'}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-zinc-100 capitalize truncate">{activeContact?.name || 'Select Portal Contact'}</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {isPartnerTypingNow ? <span className="text-blue-400 animate-pulse font-medium">is typing...</span> : 'Cloud Channel Active'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 text-zinc-400">
                <button className="p-1.5 rounded-full hover:bg-zinc-900"><Phone size={16} /></button>
                <button className="p-1.5 rounded-full hover:bg-zinc-900"><Video size={16} /></button>
                <button className="p-1.5 rounded-full hover:bg-zinc-900"><Info size={16} /></button>
              </div>
            </header>

            {/* Conversation Log Viewport Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/40">
              {activeMessages.map((msg) => {
                const isMe = msg.sender === currentUser;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] font-bold text-zinc-500 mb-0.5 px-1 uppercase tracking-wider">
                      {isMe ? 'You' : msg.sender}
                    </span>
                    <div className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2 rounded-2xl text-xs sm:text-sm shadow-xs ${
                      isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-zinc-900/90 text-zinc-100 rounded-tl-none border border-zinc-800/60'
                    }`}>
                      <p className="break-words whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
              
              {isPartnerTypingNow && (
                <div className="flex flex-col items-start">
                  <span className="text-[9px] font-bold text-zinc-500 mb-0.5 px-1 uppercase capitalize">{activeContact?.name}</span>
                  <div className="bg-zinc-900/90 border border-zinc-800/60 text-zinc-100 px-3 py-2 rounded-2xl rounded-tl-none flex items-center gap-1">
                    <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Sticky Input Footer */}
            <footer className="p-3 sm:p-4 border-t border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md">
              <div className="flex items-center gap-2 max-w-full">
                <input 
                  type="text"
                  value={newMessageText}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={activeContact ? `Message ${activeContact.name}...` : "Select a contact first"}
                  disabled={!activeContact}
                  className="flex-1 bg-zinc-900 text-zinc-100 px-4 py-2 rounded-full text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 border border-zinc-800 disabled:opacity-50"
                />
                <button onClick={handleSendMessage} disabled={!newMessageText.trim() || !activeContact} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-40 shrink-0">
                  <Send size={14} className="translate-x-[0.5px]" />
                </button>
              </div>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}