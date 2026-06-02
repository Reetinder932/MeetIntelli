import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import { notificationApi } from '../services/api';
import { Notification } from '../types';
import { useAuth } from '../context/AuthContext';
import { WebSocketService } from '../services/websocket';

const NotificationBell: React.FC = () => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
    
    // Set up real-time websocket listener for notifications
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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const markAsRead = async (id: number) => {
    try {
      await notificationApi.read(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {notifications.length > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-bounce">
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[#0d0d12] border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-sm text-white">Notifications</h3>
            <span className="text-xs text-muted-foreground">{notifications.length} unread</span>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No new notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="p-4 border-b border-border/50 hover:bg-muted/30 transition-colors flex items-start justify-between gap-3 group"
                >
                  <p className="text-xs text-muted-foreground leading-normal">{n.message}</p>
                  <button
                    onClick={() => markAsRead(n.id)}
                    className="p-1 text-muted-foreground hover:text-primary hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Mark as read"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
