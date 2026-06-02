import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash } from 'lucide-react';
import { notificationApi } from '../services/api';
import { Notification } from '../types';
import { useAuth } from '../context/AuthContext';
import { WebSocketService } from '../services/websocket';

const SidebarNotifications: React.FC = () => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const wsRef = useRef<WebSocketService | null>(null);

  const fetchUnread = async () => {
    try {
      const res = await notificationApi.unread();
      setNotifications(res.data);
    } catch (err) {
      console.error('Failed to fetch unread notifications', err);
    }
  };

  useEffect(() => {
    fetchUnread();
    
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
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      for (const n of notifications) {
        await notificationApi.read(n.id);
      }
      setNotifications([]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border/40 select-none">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-primary" /> Notifications
        </span>
        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded-full">
              {notifications.length}
            </span>
            <button 
              onClick={markAllAsRead}
              className="text-[9px] text-muted-foreground hover:text-foreground hover:underline font-semibold cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground/60 italic font-medium">
            No new notifications
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="p-3 bg-[#08080c]/40 border border-border/50 hover:border-border hover:bg-[#12121c]/20 rounded-xl transition-all flex items-start justify-between gap-2.5 group"
            >
              <p className="text-[11px] text-muted-foreground leading-normal font-normal group-hover:text-foreground/90 transition-colors">
                {n.message}
              </p>
              <button
                onClick={() => markAsRead(n.id)}
                className="p-1 text-muted-foreground hover:text-primary hover:bg-muted rounded transition-colors cursor-pointer shrink-0 mt-0.5"
                title="Mark as read"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SidebarNotifications;
