import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { meetingApi, taskApi, chatApi } from '../services/api';
import CustomSelect from '../components/CustomSelect';
import { Meeting, Task, Room } from '../types';
import { 
  Video, KanbanSquare, MessageSquare, Upload, 
  Sparkles, Calendar, CheckSquare, Loader2, ArrowRight,
  CheckCircle, Send, Bot
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { WebSocketService } from '../services/websocket';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Naming Modal States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');

  // Bot Modal States
  const [showBotModal, setShowBotModal] = useState(false);
  const [botMeetingUrl, setBotMeetingUrl] = useState('');
  const [botMeetingTitle, setBotMeetingTitle] = useState('');
  const [botJoining, setBotJoining] = useState(false);

  // AI Chatbot States
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | ''>('');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'bot'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  };

  // Upload Progress States
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeStep, setActiveStep] = useState(0); // 0: Uploading, 1: Transcribing, 2: Summarizing, 3: Indexing

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [meetRes, taskRes, roomRes] = await Promise.all([
          meetingApi.list(),
          taskApi.list(true),
          chatApi.myRooms(),
        ]);
        const fetchedMeetings = meetRes.data;
        setAllMeetings(fetchedMeetings);
        setMeetings(fetchedMeetings.slice(0, 5));
        setTasks(taskRes.data.slice(0, 5));
        setRooms(roomRes.data.slice(0, 5));

        // Auto-select the first completed meeting by default
        const completed = fetchedMeetings.filter((m: Meeting) => m.status === 'COMPLETED');
        if (completed.length > 0) {
          setSelectedMeetingId(completed[0].id);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files[0].size === 0) {
      alert('The selected audio file is empty (0 bytes). Please upload a valid, non-empty recording.');
      return;
    }

    const file = files[0];
    const defaultTitle = file.name.replace(/\.[^/.]+$/, ""); // Strip extension
    setSelectedFile(file);
    setMeetingTitle(defaultTitle);
    setShowNamingModal(true);
    
    // Reset file input value so same file can be selected again
    e.target.value = '';
  };

  const triggerUpload = async (file: File, title: string) => {
    setUploading(true);
    setProgressPercent(0);
    setProgressStatus('Uploading audio file to servers...');
    setActiveStep(0);
    setShowSuccess(false);

    let progressInterval: any = null;
    let wsInstance: WebSocketService | null = null;

    try {
      const res = await meetingApi.upload(file, title, (progressEvent: any) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Scale upload progress to represent 0% to 45% of the overall process
          const overallPercent = Math.round((percent * 45) / 100);
          setProgressPercent(overallPercent);
          
          if (percent === 100) {
            setProgressStatus('Server received file. Initializing AI pipelines...');
            setActiveStep(1);
          }
        }
      });

      const createdMeeting = res.data;
      const meetingId = createdMeeting.id;

      // Start simulating backend AI processing steps up to 98%
      let currentProgress = 45;
      progressInterval = setInterval(() => {
        currentProgress += 1;
        if (currentProgress >= 98) {
          currentProgress = 98;
        }
        
        setProgressPercent(currentProgress);

        if (currentProgress < 70) {
          setProgressStatus('Transcribing speech to text (Whisper STT)...');
          setActiveStep(1);
        } else if (currentProgress < 85) {
          setProgressStatus('Extracting meeting summary & tasks (Ollama LLM)...');
          setActiveStep(2);
        } else if (currentProgress < 95) {
          setProgressStatus('Generating RAG vector index (FAISS & SentenceTransformers)...');
          setActiveStep(3);
        } else {
          setProgressStatus('Finalizing database storage and indexing...');
          setActiveStep(3);
        }
      }, 500); // 500ms per 1%

      // Set up WebSocket connection to wait for completion notification
      if (token) {
        wsInstance = new WebSocketService(token, () => {
          wsInstance?.subscribe('/user/queue/notifications', (notification: any) => {
            // Check if notification is for this specific meeting
            if (notification.meetingId === meetingId) {
              if (progressInterval) clearInterval(progressInterval);
              wsInstance?.disconnect();

              if (notification.message.includes('Failed') || notification.message.includes('failed')) {
                alert('Processing failed: ' + notification.message);
                setUploading(false);
              } else {
                setProgressPercent(100);
                setProgressStatus('Success! Meeting processed and vector indexed.');
                setShowSuccess(true);
                setActiveStep(4);

                // Wait 2 seconds to show the success checkmark, then redirect
                setTimeout(() => {
                  navigate(`/meetings/${meetingId}`);
                }, 2000);
              }
            }
          });
        });
      } else {
        // Fallback if token is missing
        setTimeout(() => {
          if (progressInterval) clearInterval(progressInterval);
          setProgressPercent(100);
          setProgressStatus('Completed.');
          setShowSuccess(true);
          setActiveStep(4);
          setTimeout(() => {
            navigate(`/meetings/${meetingId}`);
          }, 1500);
        }, 15000);
      }

    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      if (wsInstance) wsInstance.disconnect();
      const serverError = err.response?.data ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) : err.message;
      alert('Failed to process meeting: ' + serverError);
      console.error(err);
      setUploading(false);
    }
  };

  const handleInviteBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botMeetingUrl.trim() || botJoining) return;

    setBotJoining(true);
    try {
      const res = await meetingApi.joinBot(botMeetingUrl.trim(), botMeetingTitle.trim());
      const newMeeting = res.data;
      setShowBotModal(false);
      setBotMeetingUrl('');
      setBotMeetingTitle('');
      navigate(`/meetings/${newMeeting.id}`);
    } catch (err: any) {
      alert("Failed to invite bot: " + (err.response?.data?.message || err.message));
    } finally {
      setBotJoining(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    if (selectedMeetingId) {
      const meet = allMeetings.find(m => m.id === selectedMeetingId);
      if (meet) {
        setChatHistory([
          {
            sender: 'bot',
            text: `Hi! I'm your AI assistant for "${meet.title}". Ask me anything about this meeting, such as key topics discussed, summaries, or decisions made.`
          }
        ]);
      }
    } else {
      setChatHistory([]);
    }
  }, [selectedMeetingId, allMeetings]);

  const handleAskInsightQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeetingId || !chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatHistory((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await meetingApi.chat(Number(selectedMeetingId), userMsg);
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: res.data.answer,
        },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: "Sorry, I couldn't process that question right now. Please verify the AI service and Ollama are active.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <Layout title="Dashboard">
      <div className="space-y-8 select-none">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">Collaboration Hub</h2>
            <p className="text-muted-foreground mt-1.5 font-medium">
              Manage your meetings, track tasks, and chat with team members.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Upload voice note widget */}
            <label className="flex items-center gap-3 bg-muted hover:bg-muted/95 text-foreground py-3.5 px-6 rounded-2xl font-bold shadow-lg border border-border transition-all cursor-pointer text-sm">
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Upload Voice</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileSelection}
                    className="hidden"
                    disabled={uploading}
                  />
                </>
              )}
            </label>

            {/* Invite Bot widget */}
            <button
              onClick={() => setShowBotModal(true)}
              className="flex items-center gap-3 bg-primary hover:bg-primary/95 text-primary-foreground py-3.5 px-6 rounded-2xl font-bold shadow-lg hover:shadow-primary/25 transition-all cursor-pointer border border-primary/20 text-sm"
              disabled={uploading}
            >
              <Bot className="w-5 h-5" />
              <span>Invite AI Bot</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* Left section: Meetings & Tasks */}
            <div className="xl:col-span-2 space-y-8">
              
              {/* Recent Meetings Widget */}
              <div className="bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-6 relative overflow-hidden shadow-xl hover:border-border transition-all">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                      <Video className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground">Recent Meetings</h3>
                  </div>
                  <button 
                    onClick={() => navigate('/meetings')}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View All <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {meetings.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No meetings logged yet</p>
                  ) : (
                    meetings.map((m) => (
                      <div 
                        key={m.id}
                        onClick={() => navigate(`/meetings/${m.id}`)}
                        className="p-4 bg-muted/40 border border-border/50 hover:border-primary/40 hover:bg-[#12121c]/40 hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.3)] rounded-2xl transition-all duration-300 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <h4 className="font-extrabold text-base text-foreground leading-normal">{m.title}</h4>
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Calendar className="w-3.5 h-3.5" /> Uploaded: {formatDateTime(m.createdAt)}
                          </span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    ))
                  )}
                </div>
              </div>



            </div>

            {/* Right section: AI Insights & Recent Chats */}
            <div className="space-y-8">
              
              {/* AI Insights & Chatbot Widget */}
              <div className="bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-6 relative overflow-hidden shadow-xl hover:border-primary/20 transition-all duration-500 flex flex-col h-[520px]">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-xl">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground">AI Meeting Insights</h3>
                  </div>
                </div>

                {/* Dropdown to select a meeting */}
                <div className="mb-4 flex-shrink-0">
                  <label htmlFor="meeting-select" className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Select Meeting to Query:
                  </label>
                  {allMeetings.filter(m => m.status === 'COMPLETED').length === 0 ? (
                    <div className="text-xs text-muted-foreground p-3 bg-muted/30 border border-border/50 rounded-xl">
                      No processed meetings available. Please upload a meeting first.
                    </div>
                  ) : (
                    <CustomSelect
                      value={selectedMeetingId}
                      onChange={(val) => setSelectedMeetingId(val ? Number(val) : '')}
                      options={allMeetings
                        .filter(m => m.status === 'COMPLETED')
                        .map(m => ({
                          value: m.id,
                          label: `${m.title} (Uploaded: ${formatDateTime(m.createdAt)})`
                        }))}
                      placeholder="Select a meeting..."
                      className="w-full"
                    />
                  )}
                </div>

                {/* Chat History Box */}
                <div className="flex-1 overflow-y-auto min-h-0 mb-4 pr-1 space-y-3 scrollbar-thin scrollbar-thumb-muted">
                  {selectedMeetingId ? (
                    chatHistory.map((chat, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 ${chat.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {chat.sender === 'bot' && (
                          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                            <Bot className="w-4 h-4" />
                          </div>
                        )}
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed font-medium shadow-sm border ${
                            chat.sender === 'user'
                              ? 'bg-primary text-primary-foreground border-primary/20 rounded-tr-none'
                              : 'bg-muted/65 text-foreground border-border/60 rounded-tl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{chat.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                      <Bot className="w-12 h-12 text-muted-foreground/60 animate-bounce" />
                      <p className="text-sm text-muted-foreground font-semibold">
                        Select a processed meeting to start asking questions!
                      </p>
                    </div>
                  )}

                  {chatLoading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                        <Bot className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="bg-muted/65 border border-border/60 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input form */}
                <form onSubmit={handleAskInsightQuestion} className="flex gap-2 flex-shrink-0">
                  <input
                    type="text"
                    placeholder={selectedMeetingId ? "Ask a question about the meeting..." : "Please select a meeting first"}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={!selectedMeetingId || chatLoading}
                    className="flex-1 bg-muted/50 border border-border/50 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-3.5 text-sm text-foreground placeholder-muted-foreground outline-none transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!selectedMeetingId || !chatInput.trim() || chatLoading}
                    className="p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl flex items-center justify-center transition-all shadow-md hover:shadow-primary/20 disabled:opacity-50 disabled:hover:bg-primary cursor-pointer"
                  >
                    {chatLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </form>

              </div>

              {/* Recent Chat Rooms Widget */}
              <div className="bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground">Recent Chats</h3>
                  </div>
                  <button 
                    onClick={() => navigate('/chat')}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Open Chat <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {rooms.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No chat rooms joined</p>
                  ) : (
                    rooms.map((r) => (
                      <div 
                        key={r.id}
                        onClick={() => navigate('/chat')}
                        className="p-4 bg-muted/40 border border-border/50 hover:border-primary/40 hover:bg-[#12121c]/40 hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.3)] rounded-2xl transition-all duration-300 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <h4 className="font-extrabold text-base text-foreground leading-normal"># {r.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1.5 font-normal">{r.description || 'No description'}</p>
                        </div>
                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          Active
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* Bot Invitation Modal */}
      {showBotModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border p-6 rounded-3xl shadow-2xl space-y-5"
          >
            <h3 className="font-bold text-xl text-foreground">Invite AI Assistant Bot</h3>
            <p className="text-xs text-muted-foreground">The bot will join the meeting room to record, transcribe, and analyze the conversation.</p>
            <form onSubmit={handleInviteBot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Meeting Link (Zoom / Meet)</label>
                <input
                  type="url"
                  required
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={botMeetingUrl}
                  onChange={(e) => setBotMeetingUrl(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Meeting Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Sprint Planning Sync"
                  value={botMeetingTitle}
                  onChange={(e) => setBotMeetingTitle(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 font-semibold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowBotModal(false);
                    setBotMeetingUrl('');
                    setBotMeetingTitle('');
                  }}
                  className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-all hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!botMeetingUrl.trim() || botJoining}
                  className="px-5 py-2.5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {botJoining && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{botJoining ? 'Inviting...' : 'Invite Bot'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Naming Modal */}
      {showNamingModal && selectedFile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border p-6 rounded-3xl shadow-2xl space-y-5"
          >
            <h3 className="font-bold text-xl text-foreground">Name Your Meeting</h3>
            <p className="text-xs text-muted-foreground">Give this recording a descriptive title to locate it easily in logs and AI insights.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Meeting Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Sync"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 font-semibold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNamingModal(false);
                    setSelectedFile(null);
                  }}
                  className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl transition-all hover:bg-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!meetingTitle.trim()}
                  onClick={() => {
                    setShowNamingModal(false);
                    if (selectedFile) {
                      triggerUpload(selectedFile, meetingTitle.trim());
                    }
                  }}
                  className="px-5 py-2.5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
                >
                  Upload & Process
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Upload & Processing Progress Modal */}
      {uploading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-card border border-border p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center space-y-6 relative overflow-hidden"
          >
            {/* Glow in background */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full filter blur-2xl pointer-events-none select-none" />
            
            {/* Header Icon */}
            <div className="relative">
              {showSuccess ? (
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/15 animate-bounce">
                  <CheckCircle className="w-8 h-8" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-primary/10 border border-primary/20 text-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/15">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              )}
            </div>

            {/* Typography */}
            <div>
              <h3 className="font-extrabold text-lg text-foreground">
                {showSuccess ? 'Meeting Ingested!' : 'Processing Audio'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 font-medium leading-relaxed max-w-xs mx-auto">
                {progressStatus}
              </p>
            </div>

            {/* Progress Bar & Percentage */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs font-bold px-1">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                  {showSuccess ? 'Completed' : 'Overall Progress'}
                </span>
                <span className={showSuccess ? 'text-emerald-400' : 'text-primary'}>
                  {progressPercent}%
                </span>
              </div>
              <div className="w-full bg-muted/50 border border-border/40 rounded-full h-3 overflow-hidden p-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.1 }}
                  className={`h-full rounded-full ${
                    showSuccess ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(139,92,246,0.5)]'
                  }`}
                />
              </div>
            </div>

            {/* Pipeline Stage Indicators */}
            <div className="w-full text-left space-y-2.5 pt-2 border-t border-border/40">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest block mb-1">
                Processing Steps
              </span>
              
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeStep >= 0 ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                  <span className={activeStep >= 0 ? 'text-foreground font-semibold animate-pulse' : 'text-muted-foreground'}>
                    1. Upload audio file to cluster
                  </span>
                </div>
                {activeStep > 0 && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">Done</span>}
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeStep >= 1 ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                  <span className={activeStep >= 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                    2. Speech-to-Text Transcription (Whisper)
                  </span>
                </div>
                {activeStep > 1 && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">Done</span>}
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeStep >= 2 ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                  <span className={activeStep >= 2 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                    3. Extract Meeting Summary & Tasks (Ollama)
                  </span>
                </div>
                {activeStep > 2 && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">Done</span>}
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeStep >= 3 ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                  <span className={activeStep >= 3 ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
                    4. FAISS Vector Indexing & RAG Preparation
                  </span>
                </div>
                {activeStep > 3 && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">Done</span>}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;
