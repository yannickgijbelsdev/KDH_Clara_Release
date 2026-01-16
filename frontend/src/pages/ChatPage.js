import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  MessageSquare, Send, Users, Radio, Loader2, Smile, X, 
  Plus, User, UsersRound, Search, Check
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { cn } from '../lib/utils';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Convert emoji character to its Unicode codepoint for animated emoji URL
const emojiToCodepoint = (emoji) => {
  const codePoints = [];
  for (const char of emoji) {
    codePoints.push(char.codePointAt(0).toString(16));
  }
  return codePoints.filter(cp => cp !== 'fe0f').join('_');
};

// Animated emoji component using Google's Noto Animated Emojis
const AnimatedEmoji = ({ emoji, size = 24 }) => {
  const [hasError, setHasError] = useState(false);
  const codepoint = emojiToCodepoint(emoji);
  const animatedUrl = `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/512.webp`;
  
  if (hasError) {
    return (
      <span className="inline-block align-middle" style={{ fontSize: size }}>
        {emoji}
      </span>
    );
  }
  
  return (
    <img
      src={animatedUrl}
      alt={emoji}
      className="inline-block align-middle"
      style={{ width: size, height: size, verticalAlign: 'middle', margin: '0 1px' }}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

// Parse message and render emojis with animations
const MessageWithEmojis = ({ text }) => {
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\u{FE0F})?(\u{200D}(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\u{FE0F})?)*/gu;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = emojiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'emoji', content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }
  
  return (
    <span>
      {parts.map((part, index) => {
        if (part.type === 'emoji') {
          return <AnimatedEmoji key={index} emoji={part.content} size={22} />;
        }
        return <span key={index}>{part.content}</span>;
      })}
    </span>
  );
};

// Format member names for display
const formatMemberNames = (members, currentUserId, maxShow = 3) => {
  if (!members || members.length === 0) return 'No members';
  
  const otherMembers = members.filter(m => m.id !== currentUserId);
  const displayMembers = otherMembers.slice(0, maxShow);
  const remaining = otherMembers.length - maxShow;
  
  const names = displayMembers.map(m => m.name.split(' ')[0]).join(', ');
  
  if (remaining > 0) {
    return `${names} +${remaining} more`;
  }
  return names || 'Just you';
};

const ChatPage = () => {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [newChatType, setNewChatType] = useState(null); // 'private' or 'group'
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchThreads();
    fetchTeamMembers();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeThread) {
      fetchMessages(activeThread.id);
      pollIntervalRef.current = setInterval(() => {
        fetchMessages(activeThread.id, true);
      }, 5000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeThread?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await axios.get(`${API}/chat/members`);
      setTeamMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    }
  };

  const fetchThreads = async () => {
    try {
      const response = await axios.get(`${API}/chat/threads`);
      setThreads(response.data);
      
      const teamThread = response.data.find(t => t.type === 'team');
      if (teamThread) {
        setActiveThread(teamThread);
      } else {
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
      if (!silent) toast.error('Failed to load messages');
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

  const handleEmojiSelect = (emoji) => {
    const cursorPos = inputRef.current?.selectionStart || newMessage.length;
    const textBefore = newMessage.substring(0, cursorPos);
    const textAfter = newMessage.substring(cursorPos);
    setNewMessage(textBefore + emoji.native + textAfter);
    
    setTimeout(() => {
      inputRef.current?.focus();
      const newPos = cursorPos + emoji.native.length;
      inputRef.current?.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const handleCreateChat = async () => {
    if (newChatType === 'private' && selectedMembers.length !== 1) {
      toast.error('Select one person for private chat');
      return;
    }
    if (newChatType === 'group' && selectedMembers.length < 1) {
      toast.error('Select at least one member for group chat');
      return;
    }
    if (newChatType === 'group' && !groupName.trim()) {
      toast.error('Enter a group name');
      return;
    }

    setCreatingChat(true);
    try {
      const response = await axios.post(`${API}/chat/threads`, {
        type: newChatType,
        member_ids: selectedMembers,
        name: newChatType === 'group' ? groupName.trim() : null
      });
      
      // Add new thread to list or update existing
      const existingIndex = threads.findIndex(t => t.id === response.data.id);
      if (existingIndex >= 0) {
        setThreads(prev => {
          const updated = [...prev];
          updated[existingIndex] = response.data;
          return updated;
        });
      } else {
        setThreads(prev => [response.data, ...prev]);
      }
      
      setActiveThread(response.data);
      setShowNewChatDialog(false);
      setNewChatType(null);
      setSelectedMembers([]);
      setGroupName('');
      setMemberSearch('');
      toast.success(newChatType === 'private' ? 'Chat started!' : 'Group created!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create chat');
    } finally {
      setCreatingChat(false);
    }
  };

  const toggleMemberSelection = (memberId) => {
    if (newChatType === 'private') {
      setSelectedMembers([memberId]);
    } else {
      setSelectedMembers(prev => 
        prev.includes(memberId) 
          ? prev.filter(id => id !== memberId)
          : [...prev, memberId]
      );
    }
  };

  const filteredMembers = teamMembers.filter(m => 
    m.id !== user?.id && 
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {});

  const getThreadIcon = (thread) => {
    switch (thread.type) {
      case 'team': return <Users className="w-5 h-5 text-rose-500" />;
      case 'group': return <UsersRound className="w-5 h-5 text-violet-500" />;
      case 'private': return <User className="w-5 h-5 text-emerald-500" />;
      case 'show': return <Radio className="w-5 h-5 text-amber-500" />;
      default: return <MessageSquare className="w-5 h-5 text-zinc-500" />;
    }
  };

  const getThreadName = (thread) => {
    switch (thread.type) {
      case 'team': return 'Team Chat';
      case 'group': return thread.name || 'Group Chat';
      case 'private': {
        const otherMember = thread.members?.find(m => m.id !== user?.id);
        return otherMember?.name || 'Private Chat';
      }
      case 'show': return thread.show_title || 'Show Chat';
      default: return 'Chat';
    }
  };

  const getThreadSubtitle = (thread) => {
    switch (thread.type) {
      case 'team': 
        return formatMemberNames(thread.members, user?.id, 4);
      case 'group':
        return formatMemberNames(thread.members, user?.id, 3);
      case 'private':
        return 'Direct message';
      case 'show':
        return 'Show discussion';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]" data-testid="chat-page">
      <style>{`
        em-emoji-picker {
          --rgb-background: 24, 24, 27;
          --rgb-input: 39, 39, 42;
          --rgb-color: 228, 228, 231;
          --shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          --border-radius: 12px;
        }
      `}</style>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/20 rounded-lg">
            <MessageSquare className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Team Chat</h1>
            <p className="text-sm text-zinc-400">Communicate with your team</p>
          </div>
        </div>
        <Button
          onClick={() => setShowNewChatDialog(true)}
          className="bg-rose-500 hover:bg-rose-600 gap-2"
          data-testid="new-chat-btn"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <div className="flex gap-4 h-[calc(100%-5rem)]">
        {/* Thread List */}
        <div className="w-80 glass-card rounded-xl p-4 flex-shrink-0 flex flex-col">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Conversations
          </h2>
          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-2">
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
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getThreadIcon(thread)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {getThreadName(thread)}
                      </p>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {getThreadSubtitle(thread)}
                      </p>
                      {thread.last_message && (
                        <p className="text-xs text-zinc-600 truncate mt-1 italic">
                          {thread.last_message}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Messages Area */}
        <div className="flex-1 glass-card rounded-xl flex flex-col overflow-hidden">
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  {getThreadIcon(activeThread)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">
                      {getThreadName(activeThread)}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {getThreadSubtitle(activeThread)}
                    </p>
                  </div>
                  {activeThread.members && activeThread.members.length > 0 && (
                    <div className="flex -space-x-2">
                      {activeThread.members.slice(0, 5).map((member, idx) => (
                        <div
                          key={member.id}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500/30 to-violet-500/30 border-2 border-[#18181b] flex items-center justify-center"
                          title={member.name}
                        >
                          <span className="text-xs font-semibold text-white">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      ))}
                      {activeThread.members.length > 5 && (
                        <div className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-[#18181b] flex items-center justify-center">
                          <span className="text-xs font-semibold text-zinc-300">
                            +{activeThread.members.length - 5}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
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
                                <MessageWithEmojis text={message.body} />
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
                <div className="flex gap-2 items-center relative">
                  {showEmojiPicker && (
                    <div ref={emojiPickerRef} className="absolute bottom-full left-0 mb-2 z-50">
                      <div className="relative">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowEmojiPicker(false)}
                          className="absolute -top-2 -right-2 z-10 h-6 w-6 p-0 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-600"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Picker
                          data={data}
                          onEmojiSelect={handleEmojiSelect}
                          theme="dark"
                          previewPosition="none"
                          skinTonePosition="search"
                          maxFrequentRows={2}
                          perLine={8}
                          emojiSize={28}
                          emojiButtonSize={36}
                          categories={['frequent', 'people', 'nature', 'foods', 'activity', 'places', 'objects', 'symbols', 'flags']}
                          icons="outline"
                        />
                      </div>
                    </div>
                  )}
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={cn(
                      "h-10 w-10 flex-shrink-0 transition-colors",
                      showEmojiPicker ? "bg-rose-500/20 text-rose-400" : "hover:bg-white/10 text-zinc-400 hover:text-white"
                    )}
                    data-testid="emoji-picker-btn"
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                  
                  <Input
                    ref={inputRef}
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
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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

      {/* New Chat Dialog */}
      <Dialog open={showNewChatDialog} onOpenChange={setShowNewChatDialog}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-rose-500" />
              New Chat
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Start a private conversation or create a group chat
            </DialogDescription>
          </DialogHeader>

          {!newChatType ? (
            <div className="grid grid-cols-2 gap-4 py-4">
              <button
                onClick={() => setNewChatType('private')}
                className="p-6 rounded-xl border border-zinc-700 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all group"
                data-testid="new-private-chat-btn"
              >
                <User className="w-10 h-10 text-emerald-500 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-white mb-1">Private Chat</h3>
                <p className="text-xs text-zinc-500">1-on-1 conversation</p>
              </button>
              <button
                onClick={() => setNewChatType('group')}
                className="p-6 rounded-xl border border-zinc-700 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all group"
                data-testid="new-group-chat-btn"
              >
                <UsersRound className="w-10 h-10 text-violet-500 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-white mb-1">Group Chat</h3>
                <p className="text-xs text-zinc-500">Chat with multiple people</p>
              </button>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewChatType(null);
                    setSelectedMembers([]);
                    setGroupName('');
                    setMemberSearch('');
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  ← Back
                </Button>
                <span className="text-zinc-400">
                  {newChatType === 'private' ? 'Select a person' : 'Create a group'}
                </span>
              </div>

              {newChatType === 'group' && (
                <div className="space-y-2">
                  <Label className="text-zinc-400">Group Name</Label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name..."
                    className="bg-[#27272a] border-zinc-700 text-white"
                    data-testid="group-name-input"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-zinc-400">
                  {newChatType === 'private' ? 'Select Person' : 'Select Members'}
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search team members..."
                    className="bg-[#27272a] border-zinc-700 text-white pl-10"
                    data-testid="member-search-input"
                  />
                </div>
              </div>

              <ScrollArea className="h-[250px] rounded-lg border border-zinc-800">
                <div className="p-2 space-y-1">
                  {filteredMembers.length === 0 ? (
                    <p className="text-center text-zinc-500 py-8">No team members found</p>
                  ) : (
                    filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => toggleMemberSelection(member.id)}
                        className={cn(
                          'w-full p-3 rounded-lg flex items-center gap-3 transition-all',
                          selectedMembers.includes(member.id)
                            ? 'bg-rose-500/20 border border-rose-500/30'
                            : 'hover:bg-white/5 border border-transparent'
                        )}
                        data-testid={`member-${member.id}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500/30 to-violet-500/30 flex items-center justify-center">
                          <span className="text-sm font-semibold text-white">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-white">{member.name}</p>
                          <p className="text-xs text-zinc-500">{member.role}</p>
                        </div>
                        {selectedMembers.includes(member.id) && (
                          <Check className="w-5 h-5 text-rose-500" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>

              {selectedMembers.length > 0 && (
                <p className="text-sm text-zinc-400">
                  {selectedMembers.length} member{selectedMembers.length > 1 ? 's' : ''} selected
                </p>
              )}

              <Button
                onClick={handleCreateChat}
                disabled={
                  creatingChat || 
                  (newChatType === 'private' && selectedMembers.length !== 1) ||
                  (newChatType === 'group' && (selectedMembers.length < 1 || !groupName.trim()))
                }
                className="w-full bg-rose-500 hover:bg-rose-600"
                data-testid="create-chat-btn"
              >
                {creatingChat ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {newChatType === 'private' ? 'Start Chat' : 'Create Group'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPage;
