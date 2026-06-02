import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { meetingApi } from '../services/api';
import { Meeting } from '../types';
import { Calendar, Clock, Video, ArrowRight, Loader2 } from 'lucide-react';

const MeetingsList: React.FC = () => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  };

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const res = await meetingApi.list();
        setMeetings(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMeetings();
  }, []);

  return (
    <Layout title="Meetings Log">
      <div className="space-y-6 select-none">
        <div>
          <h2 className="text-3xl font-extrabold text-foreground tracking-tight">Meetings Archive</h2>
          <p className="text-sm text-muted-foreground mt-1.5 font-medium">Browse historical processed voice logs and access details or chatbot context.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {meetings.length === 0 ? (
              <div className="md:col-span-2 text-center py-16 bg-card/75 backdrop-blur-md border border-border rounded-3xl text-muted-foreground text-sm space-y-1">
                <Video className="w-10 h-10 text-primary mx-auto mb-2 opacity-70" />
                <p className="font-bold text-foreground">No meetings logged</p>
                <p className="text-xs font-normal">Go to the Dashboard and upload an audio note to start logging voice details.</p>
              </div>
            ) : (
              meetings.map((m) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/meetings/${m.id}`)}
                  className="bg-card/75 backdrop-blur-md border border-border/80 hover:border-primary/40 hover:bg-[#12121c]/40 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] p-6 rounded-3xl transition-all duration-300 cursor-pointer flex flex-col justify-between space-y-4 shadow-lg"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-extrabold text-base text-foreground leading-normal">{m.title}</h3>
                      {m.status === 'PROCESSING' && (
                        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 select-none animate-pulse">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Processing
                        </span>
                      )}
                      {m.status === 'FAILED' && (
                        <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 font-bold px-2 py-0.5 rounded-full select-none">
                          Failed
                        </span>
                      )}
                    </div>
                    {m.status === 'PROCESSING' ? (
                      <p className="text-sm text-muted-foreground/60 mt-2 italic leading-relaxed font-normal animate-pulse">
                        Transcribing & analyzing audio...
                      </p>
                    ) : m.status === 'FAILED' ? (
                      <p className="text-sm text-red-400/80 mt-2 leading-relaxed font-normal">
                        Failed to process audio recording.
                      </p>
                    ) : (
                      m.summary && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed font-normal">
                          {m.summary}
                        </p>
                      )
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/40 pt-4 text-sm font-bold text-muted-foreground">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1.5" title="Upload Time"><Calendar className="w-3.5 h-3.5" /> Uploaded: {formatDateTime(m.createdAt)}</span>
                    </div>
                    <span className="text-primary hover:underline flex items-center gap-1 shrink-0">
                      Open Workspace <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))
            )
          }</div>
        )}
      </div>
    </Layout>
  );
};

export default MeetingsList;
