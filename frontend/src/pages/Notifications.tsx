import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { notificationApi } from '../services/api';
import { Notification } from '../types';
import { Bell, Check, Calendar, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WebSocketService } from '../services/websocket';
import { useNavigate } from 'react-router-dom';

const Notifications: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocketService | null>(null);

  const fetchNotifications = async () => {
    try {
      const res = await notificationApi.list();
      setNotifications(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (token) {
      const ws = new WebSocketService(token, () => {
        ws.subscribe('/user/queue/notifications', (notification: Notification) => {
          setNotifications((prev) => [notification, ...prev]);
        });
      });
      wsRef.current = ws;
      return () => ws.disconnect();
    }
  }, [token]);

  const markAsRead = async (id: number) => {
    try {
      await notificationApi.read(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      for (const n of unread) {
        await notificationApi.read(n.id);
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error(err);
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

  return (
    <Layout title="Notifications">
      <div className="space-y-6 select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">Notifications Log</h2>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              View transaction and background processing updates.
            </p>
          </div>

          {notifications.some((n) => !n.read) && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-primary-foreground py-2.5 px-4 rounded-xl font-semibold shadow-lg shadow-primary/20 text-xs transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" /> Mark All as Read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : (
          <div className="bg-card/75 backdrop-blur-md border border-border/80 rounded-3xl p-6 shadow-xl space-y-4">
            {notifications.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
                <Bell className="w-10 h-10 text-primary mx-auto mb-2 opacity-70" />
                <p className="font-bold text-foreground">No notifications yet</p>
                <p className="text-xs font-normal">You will be notified here when background operations complete.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 first:pt-0 last:pb-0 ${
                      !n.read ? 'bg-primary/5 -mx-6 px-6 rounded-2xl my-1 border border-primary/10' : ''
                    }`}
                  >
                    <div className="space-y-1.5">
                      <p className={`text-base leading-normal font-medium ${!n.read ? 'text-foreground font-extrabold' : 'text-muted-foreground'}`}>
                        {n.message}
                      </p>
                      <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground mt-1.5">
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {formatDateTime(n.createdAt)}</span>
                        {!n.read && (
                          <span className="text-primary bg-primary/10 border border-primary/25 px-2.5 py-0.5 rounded-md uppercase tracking-wider text-[9px] font-bold">Unread</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                      {n.meetingId && (
                        <button
                          onClick={() => navigate(`/meetings/${n.meetingId}`)}
                          className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground border border-border/80 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          View Workspace
                        </button>
                      )}
                      {!n.read && (
                        <button
                          onClick={() => markAsRead(n.id)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-xl transition-colors cursor-pointer border border-border/50"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Notifications;
