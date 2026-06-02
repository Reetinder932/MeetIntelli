import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { chatApi } from '../services/api';
import { Room, Message, User } from '../types';
import { useAuth } from '../context/AuthContext';
import { WebSocketService } from '../services/websocket';
import { 
  Hash, Plus, Send, Users, UserPlus, 
  UserMinus, LogOut, Loader2, Sparkles,
  Paperclip, File, Download, Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatRooms: React.FC = () => {
  const { user, token } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsgText, setNewMsgText] = useState('');
  const [roomMembers, setRoomMembers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  
  // Dialog state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocketService | null>(null);
  const typingTimeoutRef = useRef<{ [key: string]: any }>({});

  const fetchRooms = async (currentActiveRoomId?: number) => {
    try {
      const res = await chatApi.rooms();
      setRooms(res.data);
      
      const targetRoomId = currentActiveRoomId || activeRoom?.id;
      if (targetRoomId) {
        const updatedActive = res.data.find((r: Room) => r.id === targetRoomId);
        if (updatedActive) {
          setRoomMembers(updatedActive.members || []);
          setActiveRoom(updatedActive);
        }
      } else if (res.data.length > 0) {
        setActiveRoom(res.data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  // Fetch history when active room changes and setup STOMP subscription
  useEffect(() => {
    if (!activeRoom || !token || !user) return;

    // Fetch message history
    const fetchHistory = async () => {
      try {
        const res = await chatApi.history(activeRoom.id);
        setMessages(res.data);
        setRoomMembers(activeRoom.members || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchHistory();

    // Setup STOMP WebSocket Service
    const ws = new WebSocketService(token, () => {
      // Subscribe to active room messages channel
      ws.subscribe(`/topic/rooms/${activeRoom.id}`, (payload: any) => {
        const stompMsg = payload as Message;
        
        if (stompMsg.type === 'CHAT') {
          setMessages((prev) => [...prev, stompMsg]);
        } else if (stompMsg.type === 'JOIN' || stompMsg.type === 'LEAVE') {
          // Refresh room members on join/leave
          fetchRooms();
          // Log join/leave text in chat
          setMessages((prev) => [...prev, stompMsg]);
        } else if (stompMsg.type === 'TYPING') {
          handleTypingIndicator(stompMsg);
        }
      });
    });

    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, [activeRoom, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTypingIndicator = (msg: Message) => {
    if (msg.senderId === user?.id) return;
    
    const sender = msg.senderName;
    const isTyping = msg.messageText === 'typing';

    if (isTyping) {
      setTypingUsers((prev) => {
        if (prev.includes(sender)) return prev;
        return [...prev, sender];
      });

      // Automatically clear typing indicator after 3 seconds of inactivity
      if (typingTimeoutRef.current[sender]) {
        clearTimeout(typingTimeoutRef.current[sender]);
      }
      
      typingTimeoutRef.current[sender] = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== sender));
      }, 3000);
    } else {
      setTypingUsers((prev) => prev.filter((u) => u !== sender));
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !newMsgText.trim() || !user || !wsRef.current) return;

    wsRef.current.sendMessage('/app/chat.send-message', {
      roomId: activeRoom.id,
      senderId: user.id,
      senderName: user.name,
      messageText: newMsgText.trim(),
      mediaUrl: null,
      mediaType: null,
      type: 'CHAT',
    });

    // Reset typing
    wsRef.current.sendMessage('/app/chat.typing', {
      roomId: activeRoom.id,
      senderId: user.id,
      senderName: user.name,
      messageText: 'stopped',
      type: 'TYPING',
    });

    setNewMsgText('');
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeRoom || !user || !wsRef.current) return;

    const file = files[0];
    setUploadingMedia(true);
    try {
      const res = await chatApi.uploadMedia(file);
      const { url, mediaType } = res.data;

      // Send WebSocket message immediately with the uploaded media
      wsRef.current.sendMessage('/app/chat.send-message', {
        roomId: activeRoom.id,
        senderId: user.id,
        senderName: user.name,
        messageText: '',
        mediaUrl: url,
        mediaType: mediaType,
        type: 'CHAT',
      });
    } catch (err) {
      console.error('Failed to upload chat media', err);
      alert('Failed to send media file');
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMsgText(e.target.value);
    if (!wsRef.current || !activeRoom || !user) return;

    wsRef.current.sendMessage('/app/chat.typing', {
      roomId: activeRoom.id,
      senderId: user.id,
      senderName: user.name,
      messageText: e.target.value.trim() !== '' ? 'typing' : 'stopped',
      type: 'TYPING',
    });
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    try {
      const res = await chatApi.createRoom(newRoomName.trim(), newRoomDesc.trim());
      setRooms((prev) => [...prev, res.data]);
      setActiveRoom(res.data);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDesc('');
    } catch (err) {
      console.error(err);
    }
  };

  const isMemberOfActiveRoom = activeRoom?.members?.some((m) => m.id === user?.id) || false;

  const handleJoinLeave = async () => {
    if (!activeRoom) return;
    try {
      if (isMemberOfActiveRoom) {
        await chatApi.leave(activeRoom.id);
      } else {
        await chatApi.join(activeRoom.id);
      }
      // Re-fetch rooms with the current active room ID to force state update instantly!
      await fetchRooms(activeRoom.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Layout title="Chat Rooms">
      <div className="flex h-[calc(100vh-8.5rem)] bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl overflow-hidden shadow-2xl select-none">
        
        {/* Chat Sidebar (Rooms list) */}
        <div className="w-64 border-r border-border bg-black/25 flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <span className="font-bold text-sm text-foreground">Chat Channels</span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setActiveRoom(room)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-all cursor-pointer ${
                  activeRoom?.id === room.id
                    ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(139,92,246,0.2)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Hash className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{room.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active Chat Area */}
        <div className="flex-1 flex flex-col bg-transparent min-w-0 relative">
          {activeRoom ? (
            <>
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-border bg-background/40/30 backdrop-blur-sm flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                    <Hash className="w-4 h-4 text-primary" /> {activeRoom.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{activeRoom.description || 'No description'}</p>
                </div>

                <button
                  onClick={handleJoinLeave}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    isMemberOfActiveRoom
                      ? 'border-destructive/30 hover:border-destructive text-destructive hover:bg-destructive/5'
                      : 'border-primary/30 hover:border-primary text-primary hover:bg-primary/5'
                  }`}
                >
                  {isMemberOfActiveRoom ? (
                    <>
                      <LogOut className="w-3.5 h-3.5" /> Leave Room
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" /> Join Room
                    </>
                  )}
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {!isMemberOfActiveRoom && (
                  <div className="p-6 text-center max-w-sm mx-auto bg-muted/20 border border-border/50 rounded-2xl space-y-3">
                    <Users className="w-8 h-8 mx-auto text-primary" />
                    <h4 className="font-bold text-sm text-foreground">Join Channel</h4>
                    <p className="text-xs text-muted-foreground">You are viewing # {activeRoom.name}. Join the room to see history and start sending messages.</p>
                    <button
                      onClick={handleJoinLeave}
                      className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Join Room
                    </button>
                  </div>
                )}

                {isMemberOfActiveRoom && messages.map((msg, idx) => {
                  const isJoinLeave = msg.type === 'JOIN' || msg.type === 'LEAVE';
                  if (isJoinLeave) {
                    return (
                      <div key={idx} className="text-center text-[11px] text-muted-foreground py-1 select-none">
                        <span className="font-semibold text-foreground/80">{msg.senderName}</span> {msg.messageText}
                      </div>
                    );
                  }
                  
                  return (
                    <div
                      key={idx}
                      className={`flex gap-3 max-w-xl ${msg.senderId === user?.id ? 'ml-auto flex-row-reverse' : ''}`}
                    >
                      <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center font-bold text-xs uppercase text-primary border border-border/50 select-none">
                        {msg.senderName.slice(0, 2)}
                      </div>
                      <div>
                        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          msg.senderId === user?.id 
                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                            : 'bg-background/40 border border-border text-foreground rounded-tl-none'
                        }`}>
                          {msg.messageText && <p className="font-normal">{msg.messageText}</p>}
                          
                          {/* Image/Video/File Render Support */}
                          {msg.mediaUrl && (
                            <div className={`${msg.messageText ? 'mt-2.5' : ''} rounded-xl overflow-hidden max-w-xs md:max-w-sm border border-border/20 bg-black/25 relative group`}>
                              {msg.mediaType === 'IMAGE' ? (
                                <div className="relative">
                                  <img
                                    src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8081'}${msg.mediaUrl}`}
                                    alt="Media content"
                                    className="max-h-60 rounded-xl object-contain w-full transition-transform duration-300 group-hover:scale-[1.02]"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                                    <a
                                      href={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8081'}${msg.mediaUrl}`}
                                      download
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2.5 bg-background/90 text-foreground hover:bg-background rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all"
                                      title="Download Image"
                                    >
                                      <Download className="w-5 h-5" />
                                    </a>
                                  </div>
                                </div>
                              ) : msg.mediaType === 'VIDEO' ? (
                                <div className="relative">
                                  <video
                                    src={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8081'}${msg.mediaUrl}`}
                                    controls
                                    className="max-h-60 rounded-xl object-contain w-full"
                                  />
                                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <a
                                      href={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8081'}${msg.mediaUrl}`}
                                      download
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 bg-background/90 text-foreground hover:bg-background rounded-lg shadow-lg flex items-center justify-center transition-all hover:scale-105"
                                      title="Download Video"
                                    >
                                      <Download className="w-4 h-4" />
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <div className={`p-3.5 flex items-center gap-3 rounded-xl shadow-inner border transition-all ${
                                  msg.senderId === user?.id
                                    ? 'bg-white/10 hover:bg-white/15 border-white/10 text-foreground'
                                    : 'bg-[#0a0a14]/60 hover:bg-[#121220]/80 border-border/40 text-foreground'
                                }`}>
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                                    msg.senderId === user?.id
                                      ? 'bg-white/10 border-white/20 text-foreground'
                                      : 'bg-primary/10 border-primary/20 text-primary'
                                  }`}>
                                    <File className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold truncate leading-tight">
                                      {msg.mediaUrl.substring(msg.mediaUrl.lastIndexOf('/') + 1).replace(/^\d+_/, '')}
                                    </p>
                                    <span className={`text-[10px] block font-medium mt-0.5 ${
                                      msg.senderId === user?.id ? 'text-foreground/70' : 'text-muted-foreground'
                                    }`}>
                                      Attachment File
                                    </span>
                                  </div>
                                  <a
                                    href={msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${import.meta.env.VITE_API_URL || 'http://localhost:8081'}${msg.mediaUrl}`}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`p-2 rounded-lg transition-all hover:scale-105 active:scale-95 shadow-md flex items-center justify-center ${
                                      msg.senderId === user?.id
                                        ? 'bg-white text-primary hover:bg-white/90'
                                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                    }`}
                                    title="Download File"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground block mt-1 font-medium select-none pl-1">
                          {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicators */}
              {typingUsers.length > 0 && (
                <div className="px-6 py-1.5 text-xs text-muted-foreground select-none italic font-medium">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </div>
              )}

              {/* Input Form */}
              {isMemberOfActiveRoom && (
                <form onSubmit={handleSend} className="p-4 border-t border-border bg-card/50 flex gap-3 items-center">
                  <label className={`bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground p-3 rounded-xl shadow-lg transition-all flex items-center justify-center cursor-pointer border border-border/50 ${uploadingMedia ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}>
                    {uploadingMedia ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    ) : (
                      <Paperclip className="w-5 h-5" />
                    )}
                    <input
                      type="file"
                      disabled={uploadingMedia}
                      onChange={handleMediaUpload}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    value={newMsgText}
                    onChange={handleTyping}
                    placeholder={`Message # ${activeRoom.name}`}
                    className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="submit"
                    disabled={!newMsgText.trim()}
                    className="bg-primary hover:bg-primary/95 disabled:bg-primary/50 text-primary-foreground p-3 rounded-xl shadow-lg transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm space-y-2 select-none">
              <Users className="w-10 h-10 text-primary opacity-60 mb-2" />
              <p className="font-bold text-foreground">No active room selected</p>
              <p className="text-xs">Create or select a chat channel from the left sidebar to start collaborating.</p>
            </div>
          )}
        </div>

        {/* Members Sidebar */}
        {activeRoom && (
          <div className="w-48 border-l border-border bg-background/40 flex flex-col">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm text-foreground">Members ({roomMembers.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {roomMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2.5 px-2 py-1.5">
                  <div className="w-6 h-6 bg-primary/10 border border-primary/20 rounded-md flex items-center justify-center text-[10px] font-bold text-primary select-none uppercase">
                    {member.name.slice(0, 2)}
                  </div>
                  <span className="text-xs text-foreground/80 font-semibold truncate">{member.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border p-6 rounded-3xl shadow-2xl space-y-5"
          >
            <h3 className="font-bold text-lg text-foreground">Create New Channel</h3>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Channel Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. engineering"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</label>
                <input
                  type="text"
                  placeholder="What is this channel about?"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-all hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer"
                >
                  Create Channel
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </Layout>
  );
};

export default ChatRooms;
