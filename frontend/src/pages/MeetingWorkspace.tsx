import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { meetingApi, taskApi } from '../services/api';
import { Meeting } from '../types';
import { 
  FileText, Sparkles, KanbanSquare, Bot, 
  ArrowLeft, Clock, Send, Loader2, RefreshCw, AlertTriangle,
  Check, X, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { WebSocketService } from '../services/websocket';

const MeetingWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'tasks' | 'chat'>('transcript');
  
  // Chat state
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'bot'; text: string; references?: string[] }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocketService | null>(null);

  const fetchMeetingDetails = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const res = await meetingApi.get(Number(id));
      setMeeting(res.data);
    } catch (err) {
      console.error(err);
      if (!silent) navigate('/');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetingDetails();
  }, [id]);

  useEffect(() => {
    if ((meeting?.status === 'PROCESSING' || meeting?.status === 'RECORDING') && id && token) {
      console.log("[DEBUG Workspace] Meeting is active/processing, subscribing to WS notifications for meeting ID: " + id);
      const ws = new WebSocketService(token, () => {
        ws.subscribe('/user/queue/notifications', (notification: any) => {
          console.log("[DEBUG Workspace] Received WS notification: ", notification);
          if (notification.meetingId === Number(id)) {
            // Processing is done! Reload meeting details
            fetchMeetingDetails(false);
          }
        });
      });
      wsRef.current = ws;
      return () => ws.disconnect();
    }
  }, [meeting?.status, id, token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !question.trim() || chatLoading) return;

    const userMsg = question.trim();
    setChatHistory((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setQuestion('');
    setChatLoading(true);

    try {
      const res = await meetingApi.chat(Number(id), userMsg);
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: res.data.answer,
          references: res.data.referencedChunks || [],
        },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Sorry, I couldn\'t process that question right now. Please verify Ollama is active.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAcceptNewTask = async (taskId: number) => {
    try {
      await taskApi.acceptNewSuggestedTask(taskId);
      fetchMeetingDetails(true);
    } catch (err) {
      console.error('Failed to accept task suggestion', err);
    }
  };

  const handleRejectNewTask = async (taskId: number) => {
    try {
      await taskApi.deleteTask(taskId);
      fetchMeetingDetails(true);
    } catch (err) {
      console.error('Failed to reject task suggestion', err);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  };

  if (loading) {
    return (
      <Layout title="Meeting Workspace">
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!meeting) return null;

  const tabs = [
    { id: 'transcript', label: 'Transcript', icon: <FileText className="w-4 h-4" /> },
    { id: 'summary', label: 'Summary', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'tasks', label: 'Suggested Tasks', icon: <KanbanSquare className="w-4 h-4" /> },
    { id: 'chat', label: 'AI Chatbot', icon: <Bot className="w-4 h-4" /> },
  ] as const;

  return (
    <Layout title={meeting.title}>
      <div className="flex flex-col h-full space-y-6 select-none">
        
        {/* Back and Title Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/meetings')}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all cursor-pointer border border-border"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{meeting.title}</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1.5 font-medium flex-wrap">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Uploaded: {formatDateTime(meeting.createdAt)}</span>
              <span>•</span>
              <span>Host: {meeting.hostUser?.name || 'Unknown'}</span>
            </div>
          </div>
          {meeting.status === 'PROCESSING' && (
            <button
              onClick={() => fetchMeetingDetails(false)}
              className="ml-auto p-2.5 text-primary hover:text-primary-foreground hover:bg-primary/20 border border-primary/25 rounded-xl transition-all cursor-pointer flex items-center gap-2 text-xs font-bold"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Refresh Status</span>
            </button>
          )}
        </div>

        {meeting.status === 'RECORDING' ? (
          <div className="flex-1 bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-6 shadow-xl min-h-[400px]">
            <div className="relative">
              <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center shadow-lg shadow-red-500/15">
                <span className="w-6 h-6 rounded-full bg-red-500 animate-ping absolute" />
                <span className="w-4 h-4 rounded-full bg-red-500 relative" />
              </div>
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-xl font-extrabold text-foreground">AI Recording in Progress</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The bot has successfully joined your meeting room and is capturing the audio live. You can close this tab; the recording will continue. Click the button below when the meeting ends to compile and analyze the audio.
              </p>
            </div>
            
            <button
              onClick={async () => {
                try {
                  setLoading(true);
                  await meetingApi.stopBot(meeting.id);
                  // Trigger a short delay, then refetch
                  setTimeout(() => {
                    fetchMeetingDetails(false);
                  }, 2000);
                } catch (err) {
                  alert("Failed to stop recording bot");
                  setLoading(false);
                }
              }}
              className="px-6 py-3.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-2xl shadow-lg shadow-red-500/20 cursor-pointer flex items-center gap-2"
            >
              Stop Recording & Compile
            </button>
          </div>
        ) : meeting.status === 'PROCESSING' ? (
          <div className="flex-1 bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-6 shadow-xl min-h-[400px]">
            <div className="relative">
              <div className="w-20 h-20 bg-primary/10 border border-primary/20 text-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/15">
                <Loader2 className="w-10 h-10 animate-spin" />
              </div>
            </div>
            <div className="max-w-md">
              <h3 className="text-xl font-extrabold text-foreground">Transcribing & Analyzing Meeting</h3>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Whisper is transcribing the audio, and Ollama is summarizing and generating tasks in the background. This page will update automatically when processing is complete.
              </p>
            </div>
            <div className="w-full max-w-xs bg-muted/50 border border-border/40 rounded-full h-3 p-0.5 overflow-hidden">
              <div className="h-full rounded-full bg-primary shadow-[0_0_10px_rgba(139,92,246,0.5)] w-3/4 animate-pulse" />
            </div>
          </div>
        ) : meeting.status === 'FAILED' ? (
          <div className="flex-1 bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-6 shadow-xl min-h-[400px]">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center shadow-lg shadow-red-500/15">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div className="max-w-md">
              <h3 className="text-xl font-extrabold text-foreground">Processing Failed</h3>
              <p className="text-sm text-red-400 mt-3 leading-relaxed font-medium">
                {meeting.description || "An error occurred while processing the meeting audio. Please verify your local Whisper/Ollama setups."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Workspace Tab Buttons */}
            <div className="flex border-b border-border gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-semibold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Active Workspace Viewport */}
        <div className="flex-1 min-h-0 bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-6 overflow-hidden flex flex-col shadow-xl">
          <AnimatePresence mode="wait">
            {activeTab === 'transcript' && (
              <motion.div
                key="transcript"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-y-auto space-y-6 pr-2"
              >
                {meeting.chunks && meeting.chunks.length > 0 ? (
                  meeting.chunks.map((chunk) => (
                    <div 
                      key={chunk.id} 
                      className="p-4 bg-muted/50 border border-border/50 rounded-2xl flex items-start gap-4 hover:border-border transition-colors group"
                    >
                      <div className="text-[10px] uppercase font-bold text-primary/70 bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20 flex items-center gap-1 select-none">
                        <Clock className="w-3.5 h-3.5" />
                        {chunk.startTimestamp || '00:00'}
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed font-normal">{chunk.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    No transcript segments available.
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'summary' && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-y-auto pr-2"
              >
                <div className="p-6 bg-muted/50 border border-border/50 rounded-2xl">
                  <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" /> Meeting Summary
                  </h3>
                  <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line font-normal">
                    {meeting.summary || 'Summary not processed yet.'}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 overflow-y-auto space-y-4 pr-2"
              >
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl mb-2 flex items-center justify-between">
                  <span className="text-xs text-primary-foreground/90 font-medium">
                    AI extracted suggested tasks from this meeting. Go to the <b>Tasks Board</b> to manage or accept/reject status transitions.
                  </span>
                  <button 
                    onClick={() => navigate('/tasks')} 
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Open Tasks Board
                  </button>
                </div>

                {meeting.tasks && meeting.tasks.length > 0 ? (
                  meeting.tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className={`p-5 bg-muted/40 border border-border/60 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 hover:border-primary/25 shadow ${
                        task.isSuggested 
                          ? 'border-primary/40 shadow-[0_0_15px_rgba(139,92,246,0.05)] hover:border-primary/65' 
                          : ''
                      }`}
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h4 className="font-extrabold text-base text-foreground leading-normal">{task.title}</h4>
                          {task.isSuggested && (
                            <span className="text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full flex items-center gap-1 select-none animate-pulse">
                              <Sparkles className="w-3.5 h-3.5" /> AI Recommendation
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-2 leading-relaxed font-normal">{task.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3.5 self-end md:self-center">
                        {task.assignedUser && (
                          <span className="text-xs text-muted-foreground font-bold bg-muted border border-border/60 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            {task.assignedUser.name}
                          </span>
                        )}
                        
                        {task.isSuggested ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRejectNewTask(task.id)}
                              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                              title="Reject suggestion"
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </button>
                            <button
                              onClick={() => handleAcceptNewTask(task.id)}
                              className="px-3.5 py-1.5 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Accept
                            </button>
                          </div>
                        ) : (
                          <span className={`text-xs font-bold border rounded-lg px-2.5 py-1.5 ${
                            task.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : task.status === 'IN_PROGRESS'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          }`}>
                            {task.status === 'COMPLETED' ? 'Completed' : task.status === 'IN_PROGRESS' ? 'In Progress' : 'To Do'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    No tasks extracted for this meeting.
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col h-full min-h-0"
              >
                {/* Chat window history */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground text-sm max-w-md mx-auto space-y-2">
                      <Bot className="w-10 h-10 text-primary mx-auto mb-2 opacity-80" />
                      <p className="font-bold text-foreground">Ask anything about this meeting</p>
                      <p className="text-xs font-normal">I will look up details in the transcript and answer using context retrieved from FAISS storage.</p>
                    </div>
                  )}

                  {chatHistory.map((chat, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${chat.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-xl p-4 rounded-2xl text-sm leading-relaxed font-normal ${
                          chat.sender === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                            : 'bg-muted/50 border border-border/80 text-foreground rounded-tl-none'
                        }`}
                      >
                        {chat.text}
                      </div>

                      {/* References for RAG bot answers */}
                      {chat.references && chat.references.length > 0 && (
                        <div className="mt-2 space-y-1.5 max-w-xl">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                            References (FAISS chunks):
                          </span>
                          {chat.references.map((ref, rIdx) => (
                            <div key={rIdx} className="p-2 bg-background/60 border border-border/30 rounded-lg text-[11px] text-muted-foreground font-normal italic leading-normal">
                              "{ref}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>Thinking... Searching vector index...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input form */}
                <form onSubmit={handleAskQuestion} className="flex gap-3 border-t border-border/50 pt-4">
                  <input
                    type="text"
                    required
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask: What tasks were assigned? Why was the deployment delayed?"
                    className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading}
                    className="bg-primary hover:bg-primary/95 text-primary-foreground p-3 rounded-xl shadow-lg transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>
        )}
      </div>
    </Layout>
  );
};

export default MeetingWorkspace;
