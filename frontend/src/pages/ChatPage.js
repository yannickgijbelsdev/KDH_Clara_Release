import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { MessageSquare, Send, Users, Radio, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ChatPage = () => {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    fetchThreads();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeThread) {
      fetchMessages(activeThread.id);
      // Poll for new messages every 5 seconds
      pollIntervalRef.current = setInterval(() => {
        fetchMessages(activeThread.id, true);
      }, 5000);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [activeThread?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchThreads = async () => {
    try {
      const response = await axios.get(`${API}/chat/threads`);
      setThreads(response.data);
      
      // Auto-select or create team thread
      const teamThread = response.data.find(t => t.type === 'team');
      if (teamThread) {
        setActiveThread(teamThread);
      } else {
        // Create default team thread
        const newThread = await axios.get(`${API}/chat/threads/team`);
        setActiveThread(newThread.data);
        setThreads([newThread.data, ...response.data]);
      }
    } catch (error) {
      toast.error('Failed to load chat threads');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (threadId, silent = false) => {
    try {
      const response = await axios.get(`${API}/chat/threads/${threadId}/messages?limit=100`);
      setMessages(response.data);
    } catch (error) {
      if (!silent) {
        toast.error('Failed to load messages');
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeThread) return;

    setSending(true);
    try {
      const response = await axios.post(
        `${API}/chat/threads/${activeThread.id}/messages`,
        { body: newMessage.trim() }
      );
      setMessages([...messages, response.data]);
      setNewMessage('');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString();
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]" data-testid="chat-page">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-rose-500/20 rounded-lg">
          <MessageSquare className="w-6 h-6 text-rose-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Team Chat</h1>
          <p className="text-sm text-zinc-400">Communicate with your team</p>
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100%-5rem)]">
        {/* Thread List */}
        <div className="w-72 glass-card rounded-xl p-4 flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Conversations
          </h2>
          <div className="space-y-2">
            {threads.map((thread) => (
              <button
                key={thread.id}
                data-testid={`thread-${thread.id}`}
                onClick={() => setActiveThread(thread)}
                className={cn(
                  'w-full p-3 rounded-lg text-left transition-all',
                  activeThread?.id === thread.id
                    ? 'bg-rose-500/20 border border-rose-500/30'
                    : 'hover:bg-white/5 border border-transparent'
                )}
              >
                <div className="flex items-center gap-3">
                  {thread.type === 'team' ? (
                    <Users className="w-5 h-5 text-rose-500" />
                  ) : (
                    <Radio className="w-5 h-5 text-amber-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {thread.type === 'team' ? 'Team Chat' : thread.show_title || 'Show Chat'}
                    </p>
                    {thread.last_message && (
                      <p className="text-xs text-zinc-500 truncate">
                        {thread.last_message}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 glass-card rounded-xl flex flex-col overflow-hidden">
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                {activeThread.type === 'team' ? (
                  <Users className="w-5 h-5 text-rose-500" />
                ) : (
                  <Radio className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <h3 className="font-semibold text-white">
                    {activeThread.type === 'team' ? 'Team Chat' : activeThread.show_title || 'Show Chat'}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {activeThread.type === 'team' ? 'All team members' : 'Show discussion'}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-6">
                  {Object.entries(groupedMessages).map(([date, msgs]) => (
                    <div key={date}>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-zinc-500 font-medium">{date}</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                      <div className="space-y-4">
                        {msgs.map((message) => (
                          <div
                            key={message.id}
                            data-testid={`message-${message.id}`}
                            className={cn(
                              'flex gap-3',
                              message.user_id === user?.id ? 'flex-row-reverse' : ''
                            )}
                          >
                            <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-rose-500">
                                {(message.user_name || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div
                              className={cn(
                                'max-w-[70%] rounded-2xl px-4 py-2',
                                message.user_id === user?.id
                                  ? 'bg-rose-500/20 rounded-tr-none'
                                  : 'bg-white/5 rounded-tl-none'
                              )}
                            >
                              {message.user_id !== user?.id && (
                                <p className="text-xs font-medium text-rose-400 mb-1">
                                  {message.user_name}
                                </p>
                              )}
                              <p className="text-sm text-white whitespace-pre-wrap break-words">
                                {message.body}
                              </p>
                              <p className="text-xs text-zinc-500 mt-1 text-right">
                                {formatTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10">
                <div className="flex gap-2">
                  <Input
                    data-testid="message-input"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                    disabled={sending}
                  />
                  <Button
                    type="submit"
                    data-testid="send-message-btn"
                    disabled={!newMessage.trim() || sending}
                    className="bg-rose-500 hover:bg-rose-600"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500">
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
