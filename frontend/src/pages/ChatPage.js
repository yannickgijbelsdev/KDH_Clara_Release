import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  MessageSquare, Send, Users, Radio, Loader2, Smile, X, 
  Plus, User, UsersRound, Search, Check, Settings, UserPlus,
  UserMinus, Shield, Crown, Paperclip, Image, Music, Play, Pause,
  Edit2, ChevronLeft, Menu, Trash2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { cn } from '../lib/utils';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { getAvatarUrl } from '../utils/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Emoji helpers
const emojiToCodepoint = (emoji) => {
  const codePoints = [];
  for (const char of emoji) {
    codePoints.push(char.codePointAt(0).toString(16));
  }
  return codePoints.filter(cp => cp !== 'fe0f').join('_');
};

const AnimatedEmoji = ({ emoji, size = 24 }) => {
  const [hasError, setHasError] = useState(false);
  const codepoint = emojiToCodepoint(emoji);
  const animatedUrl = `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/512.webp`;
  
  if (hasError) {
    return <span className="inline-block align-middle" style={{ fontSize: size }}>{emoji}</span>;
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

// Audio Player Component
const AudioPlayer = ({ url, name }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-black/20 rounded-lg p-3 mt-2">
      <audio
        ref={audioRef}
        src={`${process.env.REACT_APP_BACKEND_URL}${url}`}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onEnded={() => setIsPlaying(false)}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        className="h-10 w-10 rounded-full bg-orange-500/20 hover:bg-orange-500/30 text-rose-400"
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </Button>
      <div className="flex-1">
        <p className="text-xs text-zinc-400 truncate">{name}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-orange-500 transition-all"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};

// Message Attachment Display
const MessageAttachment = ({ attachment_url, attachment_type, attachment_name }) => {
  if (!attachment_url) return null;
  
  const fullUrl = attachment_url.startsWith('http') 
    ? attachment_url 
    : `${process.env.REACT_APP_BACKEND_URL}${attachment_url}`;

  if (attachment_type === 'image') {
    return (
      <div className="mt-2 rounded-lg overflow-hidden max-w-xs">
        <img 
          src={fullUrl} 
          alt={attachment_name || 'Image'} 
          className="w-full h-auto max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(fullUrl, '_blank')}
        />
      </div>
    );
  }
  
  if (attachment_type === 'audio') {
    return <AudioPlayer url={attachment_url} name={attachment_name || 'Audio'} />;
  }
  
  return (
    <a 
      href={fullUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-2 p-2 bg-black/20 rounded-lg hover:bg-black/30 transition-colors"
    >
      <Paperclip className="w-4 h-4 text-zinc-400" />
      <span className="text-sm text-zinc-600 truncate">{attachment_name || 'File'}</span>
    </a>
  );
};

const formatMemberNames = (members, currentUserId, maxShow = 3) => {
  if (!members || members.length === 0) return 'No members';
  const otherMembers = members.filter(m => m.id !== currentUserId);
  const displayMembers = otherMembers.slice(0, maxShow);
  const remaining = otherMembers.length - maxShow;
  const names = displayMembers.map(m => m.name.split(' ')[0]).join(', ');
  if (remaining > 0) return `${names} +${remaining} more`;
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
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newChatType, setNewChatType] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // Start closed on mobile
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastMessageTimeRef = useRef(null);
  const activeThreadIdRef = useRef(null);

  // Keep ref in sync with activeThread
  useEffect(() => {
    activeThreadIdRef.current = activeThread?.id || null;
  }, [activeThread?.id]);

  // Fetch functions
  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/chat/members`);
      setTeamMembers(response.data);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    }
  }, []);

  const fetchThreads = useCallback(async (silent = false, isPolling = false) => {
    try {
      const response = await axios.get(`${API}/chat/threads`);
      setThreads(response.data);
      
      // When polling, only update the threads list, don't change active thread selection
      if (isPolling) {
        // Just update the active thread data if it's in the list
        const currentActiveId = activeThreadIdRef.current;
        if (currentActiveId) {
          const updatedActive = response.data.find(t => t.id === currentActiveId);
          if (updatedActive) {
            setActiveThread(updatedActive);
          }
        }
        return;
      }
      
      // Initial load - select team thread by default if no active thread
      const currentActiveId = activeThreadIdRef.current;
      if (currentActiveId) {
        const updatedActive = response.data.find(t => t.id === currentActiveId);
        if (updatedActive) {
          setActiveThread(updatedActive);
        }
      } else {
        // Select team thread by default only on initial load
        const teamThread = response.data.find(t => t.type === 'team');
        if (teamThread) {
          setActiveThread(teamThread);
        } else {
          const newThread = await axios.get(`${API}/chat/threads/team`);
          setActiveThread(newThread.data);
          setThreads([newThread.data, ...response.data]);
        }
      }
    } catch (error) {
      if (!silent) toast.error('Failed to load chat threads');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (threadId, isPolling = false) => {
    try {
      let url = `${API}/chat/threads/${threadId}/messages?limit=100`;
      if (isPolling && lastMessageTimeRef.current) {
        url += `&after=${encodeURIComponent(lastMessageTimeRef.current)}`;
      }
      
      const response = await axios.get(url);
      
      if (isPolling && lastMessageTimeRef.current) {
        // Append new messages
        if (response.data.length > 0) {
          setMessages(prev => [...prev, ...response.data]);
          lastMessageTimeRef.current = response.data[response.data.length - 1].created_at;
        }
      } else {
        setMessages(response.data);
        if (response.data.length > 0) {
          lastMessageTimeRef.current = response.data[response.data.length - 1].created_at;
        }
      }
    } catch (error) {
      if (!isPolling) toast.error('Failed to load messages');
    }
  }, []);

  // Refresh thread data
  const refreshThread = useCallback(async (threadId) => {
    try {
      const response = await axios.get(`${API}/chat/threads/${threadId}`);
      setActiveThread(response.data);
      setThreads(prev => prev.map(t => t.id === threadId ? response.data : t));
    } catch (error) {
      console.error('Failed to refresh thread:', error);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
    fetchTeamMembers();
    
    // Poll for thread list updates every 5 seconds (for new chats, last message previews)
    const threadPollInterval = setInterval(() => {
      fetchThreads(true, true); // silent=true, isPolling=true
    }, 5000);
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      clearInterval(threadPollInterval);
    };
  }, []);

  useEffect(() => {
    if (activeThread) {
      lastMessageTimeRef.current = null;
      fetchMessages(activeThread.id);
      
      // Real-time polling every 2 seconds for messages
      pollIntervalRef.current = setInterval(() => {
        fetchMessages(activeThread.id, true);
      }, 2000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeThread?.id, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // Handlers
  const handleSendMessage = async (e, attachmentData = null) => {
    e?.preventDefault();
    if ((!newMessage.trim() && !attachmentData) || !activeThread) return;

    setSending(true);
    try {
      const messagePayload = {
        body: newMessage.trim() || (attachmentData ? `Sent ${attachmentData.type}` : ''),
        ...attachmentData && {
          attachment_url: attachmentData.url,
          attachment_type: attachmentData.type,
          attachment_name: attachmentData.name
        }
      };
      
      const response = await axios.post(
        `${API}/chat/threads/${activeThread.id}/messages`,
        messagePayload
      );
      setMessages(prev => [...prev, response.data]);
      lastMessageTimeRef.current = response.data.created_at;
      setNewMessage('');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/chat/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      await handleSendMessage(null, {
        url: response.data.url,
        type: response.data.type,
        name: response.data.name
      });
      
      toast.success('File uploaded!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  const handleUpdateGroupName = async () => {
    if (!editedName.trim() || !activeThread) return;
    
    try {
      const response = await axios.patch(`${API}/chat/threads/${activeThread.id}`, {
        name: editedName.trim()
      });
      setActiveThread(response.data);
      setThreads(prev => prev.map(t => t.id === activeThread.id ? response.data : t));
      setEditingName(false);
      toast.success('Group name updated!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update group name');
    }
  };

  const handleManageMember = async (action, memberId, role = null) => {
    try {
      const response = await axios.post(`${API}/chat/threads/${activeThread.id}/members`, {
        action,
        member_id: memberId,
        role
      });
      setActiveThread(response.data);
      setThreads(prev => prev.map(t => t.id === activeThread.id ? response.data : t));
      toast.success(
        action === 'add' ? 'Member added!' :
        action === 'remove' ? 'Member removed!' :
        'Role updated!'
      );
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to manage member');
    }
  };

  const handleDeleteGroup = async () => {
    if (!activeThread) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API}/chat/threads/${activeThread.id}`);
      setThreads(prev => prev.filter(t => t.id !== activeThread.id));
      
      // Switch to team chat
      const teamThread = threads.find(t => t.type === 'team' && t.id !== activeThread.id);
      setActiveThread(teamThread || null);
      
      setShowDeleteDialog(false);
      toast.success(activeThread.type === 'private' ? 'Conversation deleted!' : 'Group deleted successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!activeThread) return;
    
    try {
      await axios.delete(`${API}/chat/threads/${activeThread.id}/messages/${messageId}`);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success('Message deleted!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete message');
    }
  };

  const toggleMemberSelection = (memberId) => {
    if (newChatType === 'private') {
      setSelectedMembers([memberId]);
    } else {
      setSelectedMembers(prev => 
        prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
      );
    }
  };

  const filteredMembers = teamMembers.filter(m => 
    m.id !== user?.id && m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const nonGroupMembers = teamMembers.filter(m => 
    m.id !== user?.id && !activeThread?.member_ids?.includes(m.id)
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
      case 'team': return <Users className="w-5 h-5 text-orange-500" />;
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
      case 'team': return formatMemberNames(thread.members, user?.id, 4);
      case 'group': return formatMemberNames(thread.members, user?.id, 3);
      case 'private': return 'Direct message';
      case 'show': return 'Show discussion';
      default: return '';
    }
  };

  const getUserRole = () => activeThread?.member_roles?.[user?.id];
  const isOwnerOrAdmin = () => ['owner', 'admin'].includes(getUserRole());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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

      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-1 sm:mb-2">Team Chat</h1>
            <p className="text-xs sm:text-sm text-zinc-400 hidden sm:block">Communicate with your team</p>
          </div>
        </div>
        <Button
          onClick={() => setShowNewChatDialog(true)}
          className="bg-orange-500 hover:bg-orange-600 gap-2"
          size="sm"
          data-testid="new-chat-btn"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Chat</span>
        </Button>
      </div>

      <div className="flex gap-2 md:gap-4 h-[calc(100%-4rem)] relative">
        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <>
            <div 
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
              onClick={() => setShowSidebar(false)}
            />
            <div className="fixed top-0 left-0 h-full w-[280px] z-50 glass-card rounded-r-xl p-4 flex flex-col md:hidden animate-in slide-in-from-left duration-300">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                  Conversations
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setShowSidebar(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => {
                        setActiveThread(thread);
                        setShowSidebar(false);
                      }}
                      className={cn(
                        'w-full p-3 rounded-lg text-left transition-all',
                        activeThread?.id === thread.id
                          ? 'bg-orange-500/20 border border-orange-500/30'
                          : 'hover:bg-white/5 border border-transparent'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{getThreadIcon(thread)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{getThreadName(thread)}</p>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">{getThreadSubtitle(thread)}</p>
                          {thread.last_message && (
                            <p className="text-xs text-zinc-400 truncate mt-1">{thread.last_message}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {/* Desktop Sidebar - Always visible */}
        <div className="hidden md:flex glass-card rounded-xl p-4 flex-col md:w-72 lg:w-80 md:flex-shrink-0">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Conversations
          </h2>
          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-2">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  data-testid={`thread-${thread.id}`}
                  onClick={() => {
                    setActiveThread(thread);
                    setShowSidebar(false);
                  }}
                  className={cn(
                    'w-full p-3 rounded-lg text-left transition-all',
                    activeThread?.id === thread.id
                      ? 'bg-orange-500/20 border border-orange-500/30'
                      : 'hover:bg-white/5 border border-transparent'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getThreadIcon(thread)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{getThreadName(thread)}</p>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{getThreadSubtitle(thread)}</p>
                      {thread.last_message && (
                        <p className="text-xs text-zinc-400 truncate mt-1">{thread.last_message}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Messages Area */}
        <div className="flex-1 glass-card rounded-xl flex flex-col overflow-hidden min-w-0">
          {activeThread ? (
            <>
              {/* Thread Header */}
              <div className="p-3 md:p-4 border-b border-white/10">
                <div className="flex items-center gap-2 md:gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden flex-shrink-0"
                    onClick={() => setShowSidebar(true)}
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                  {getThreadIcon(activeThread)}
                  <div className="flex-1 min-w-0">
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="h-8 bg-white/5 border-white/20 text-white text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateGroupName();
                            if (e.key === 'Escape') setEditingName(false);
                          }}
                        />
                        <Button size="sm" onClick={handleUpdateGroupName} className="h-8">
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} className="h-8">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-zinc-900 truncate">{getThreadName(activeThread)}</h3>
                        {activeThread.type === 'group' && isOwnerOrAdmin() && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditedName(activeThread.name || '');
                              setEditingName(true);
                            }}
                          >
                            <Edit2 className="w-3 h-3 text-zinc-400" />
                          </Button>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-zinc-500 truncate">{getThreadSubtitle(activeThread)}</p>
                  </div>
                  
                  {/* Member avatars */}
                  <div className="hidden sm:flex -space-x-2">
                    {activeThread.members?.slice(0, 4).map((member) => (
                      <div
                        key={member.id}
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/30 to-violet-500/30 border-2 border-[#18181b] flex items-center justify-center"
                        title={member.name}
                      >
                        {getAvatarUrl(member) ? (
                          <img src={getAvatarUrl(member)} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-zinc-900">{member.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                    ))}
                    {activeThread.members?.length > 4 && (
                      <div className="w-8 h-8 rounded-full bg-zinc-200 border-2 border-[#18181b] flex items-center justify-center">
                        <span className="text-xs font-semibold text-zinc-600">+{activeThread.members.length - 4}</span>
                      </div>
                    )}
                  </div>

                  {/* Settings dropdown for groups */}
                  {activeThread.type === 'group' && isOwnerOrAdmin() && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Settings className="w-5 h-5 text-zinc-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-white border-zinc-200">
                        <DropdownMenuItem 
                          onClick={() => setShowManageDialog(true)}
                          className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Manage Members
                        </DropdownMenuItem>
                        {getUserRole() === 'owner' && (
                          <>
                            <DropdownMenuSeparator className="bg-zinc-800" />
                            <DropdownMenuItem 
                              onClick={() => setShowDeleteDialog(true)}
                              className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Group
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  
                  {/* Delete option for private chats */}
                  {activeThread.type === 'private' && (
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-3 md:p-4">
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
                              'flex gap-2 md:gap-3 group',
                              message.user_id === user?.id ? 'flex-row-reverse' : ''
                            )}
                          >
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-orange-500">
                                {(message.user_name || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="relative">
                              <div
                                className={cn(
                                  'max-w-[80%] md:max-w-[70%] rounded-2xl px-3 md:px-4 py-2',
                                  message.user_id === user?.id
                                    ? 'bg-orange-500/20 rounded-tr-none'
                                    : 'bg-white/5 rounded-tl-none'
                                )}
                              >
                                {message.user_id !== user?.id && (
                                  <p className="text-xs font-medium text-rose-400 mb-1">{message.user_name}</p>
                                )}
                                {message.body && (
                                  <p className="text-sm text-white whitespace-pre-wrap break-words">
                                    <MessageWithEmojis text={message.body} />
                                  </p>
                                )}
                                <MessageAttachment
                                  attachment_url={message.attachment_url}
                                  attachment_type={message.attachment_type}
                                  attachment_name={message.attachment_name}
                                />
                                <p className="text-xs text-zinc-500 mt-1 text-right">{formatTime(message.created_at)}</p>
                              </div>
                              {/* Delete message button - only for own messages */}
                              {message.user_id === user?.id && (
                                <button
                                  onClick={() => handleDeleteMessage(message.id)}
                                  className={cn(
                                    'absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity',
                                    'p-1 rounded-full bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400',
                                    message.user_id === user?.id ? 'right-full mr-1' : 'left-full ml-1'
                                  )}
                                  title="Delete message"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
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
              <form onSubmit={handleSendMessage} className="p-3 md:p-4 border-t border-white/10">
                <div className="flex gap-2 items-center relative">
                  {showEmojiPicker && (
                    <div ref={emojiPickerRef} className="absolute bottom-full left-0 mb-2 z-50">
                      <div className="relative">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowEmojiPicker(false)}
                          className="absolute -top-2 -right-2 z-10 h-6 w-6 p-0 rounded-full bg-zinc-800 hover:bg-zinc-200 border border-zinc-600"
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
                      "h-9 w-9 md:h-10 md:w-10 flex-shrink-0 transition-colors",
                      showEmojiPicker ? "bg-orange-500/20 text-rose-400" : "hover:bg-white/10 text-zinc-400 hover:text-zinc-700"
                    )}
                    data-testid="emoji-picker-btn"
                  >
                    <Smile className="w-5 h-5" />
                  </Button>

                  {/* File upload */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*,audio/*,.pdf,.txt"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0 hover:bg-white/10 text-zinc-400 hover:text-zinc-700"
                    data-testid="attachment-btn"
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                  </Button>
                  
                  <Input
                    ref={inputRef}
                    data-testid="message-input"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 h-9 md:h-10"
                    disabled={sending}
                  />
                  <Button
                    type="submit"
                    data-testid="send-message-btn"
                    disabled={!newMessage.trim() || sending}
                    className="bg-orange-500 hover:bg-orange-600 h-9 md:h-10 w-9 md:w-10 p-0"
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
        <DialogContent className="bg-white border-zinc-200 text-zinc-900 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-orange-500" />
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
                className="p-6 rounded-xl border border-zinc-300 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all group"
                data-testid="new-private-chat-btn"
              >
                <User className="w-10 h-10 text-emerald-500 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-zinc-900 mb-1">Private Chat</h3>
                <p className="text-xs text-zinc-500">1-on-1 conversation</p>
              </button>
              <button
                onClick={() => setNewChatType('group')}
                className="p-6 rounded-xl border border-zinc-300 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all group"
                data-testid="new-group-chat-btn"
              >
                <UsersRound className="w-10 h-10 text-violet-500 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold text-zinc-900 mb-1">Group Chat</h3>
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
                  className="text-zinc-400 hover:text-zinc-700"
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
                    className="bg-zinc-100 border-zinc-300 text-white"
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
                    className="bg-zinc-100 border-zinc-300 text-white pl-10"
                  />
                </div>
              </div>

              <ScrollArea className="h-[250px] rounded-lg border border-zinc-200">
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
                            ? 'bg-orange-500/20 border border-orange-500/30'
                            : 'hover:bg-white/5 border border-transparent'
                        )}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/30 to-violet-500/30 flex items-center justify-center">
                          <span className="text-sm font-semibold text-zinc-900">{member.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-zinc-900">{member.name}</p>
                          <p className="text-xs text-zinc-500">{member.role}</p>
                        </div>
                        {selectedMembers.includes(member.id) && <Check className="w-5 h-5 text-orange-500" />}
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
                className="w-full bg-orange-500 hover:bg-orange-600"
                data-testid="create-chat-btn"
              >
                {creatingChat && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {newChatType === 'private' ? 'Start Chat' : 'Create Group'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-900 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-500" />
              Manage Members
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add or remove members, and manage their roles
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Current Members */}
            <div>
              <Label className="text-zinc-400 mb-2 block">Current Members ({activeThread?.members?.length || 0})</Label>
              <ScrollArea className="h-[200px] rounded-lg border border-zinc-200">
                <div className="p-2 space-y-1">
                  {activeThread?.members?.map((member) => {
                    const memberRole = activeThread.member_roles?.[member.id] || 'member';
                    const isCreator = member.id === activeThread.created_by;
                    
                    return (
                      <div key={member.id} className="p-3 rounded-lg flex items-center gap-3 bg-white/5">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500/30 to-violet-500/30 flex items-center justify-center">
                          <span className="text-sm font-semibold text-zinc-900">{member.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-zinc-900">{member.name}</p>
                            {memberRole === 'owner' && <Crown className="w-4 h-4 text-amber-500" />}
                            {memberRole === 'admin' && <Shield className="w-4 h-4 text-violet-500" />}
                          </div>
                          <p className="text-xs text-zinc-500">{member.role} • {memberRole}</p>
                        </div>
                        {member.id !== user?.id && !isCreator && (
                          <div className="flex items-center gap-2">
                            <Select
                              value={memberRole}
                              onValueChange={(value) => handleManageMember('set_role', member.id, value)}
                            >
                              <SelectTrigger className="w-24 h-8 bg-zinc-800 border-zinc-300 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white border-zinc-200">
                                <SelectItem value="member" className="text-zinc-600">Member</SelectItem>
                                <SelectItem value="admin" className="text-zinc-600">Admin</SelectItem>
                                {getUserRole() === 'owner' && (
                                  <SelectItem value="owner" className="text-zinc-600">Owner</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => handleManageMember('remove', member.id)}
                            >
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Add Members */}
            {nonGroupMembers.length > 0 && (
              <div>
                <Label className="text-zinc-400 mb-2 block">Add Members</Label>
                <ScrollArea className="h-[150px] rounded-lg border border-zinc-200">
                  <div className="p-2 space-y-1">
                    {nonGroupMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleManageMember('add', member.id)}
                        className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-white/5 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-500/30 flex items-center justify-center">
                          <span className="text-sm font-semibold text-zinc-900">{member.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-zinc-900">{member.name}</p>
                          <p className="text-xs text-zinc-500">{member.role}</p>
                        </div>
                        <UserPlus className="w-5 h-5 text-emerald-500" />
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Group/Chat Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              {activeThread?.type === 'private' ? 'Delete Conversation' : 'Delete Group'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {activeThread?.type === 'private' ? (
                <>Are you sure you want to delete this conversation with <span className="text-zinc-700 font-medium">{getThreadName(activeThread)}</span>?</>
              ) : (
                <>Are you sure you want to delete <span className="text-zinc-700 font-medium">"{activeThread?.name}"</span>?</>
              )}
              {' '}This will permanently delete all messages and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleDeleteGroup}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                activeThread?.type === 'private' ? 'Delete Conversation' : 'Delete Group'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatPage;
