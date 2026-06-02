import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Video, KanbanSquare, MessageSquare, LogOut, Headset, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../services/api';
import { WebSocketService } from '../services/websocket';

const Sidebar: React.FC = () => {
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocketService | null>(null);

  const fetchUnreadCount = async () => {
    try {
      const res = await notificationApi.unread();
      setUnreadCount(res.data.length);
    } catch (err) {
      console.error('Failed to fetch unread notification count', err);
    }
  };

  useEffect(() => {
    fetchUnreadCount();

    if (token) {
      const ws = new WebSocketService(token, () => {
        ws.subscribe('/user/queue/notifications', () => {
          setUnreadCount((prev) => prev + 1);
        });
      });
      wsRef.current = ws;
      return () => ws.disconnect();
    }
  }, [token]);

  useEffect(() => {
    fetchUnreadCount();
  }, [location.pathname]);

  const links = [
    { to: '/', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
    { to: '/meetings', icon: <Video className="w-5 h-5" />, label: 'Meetings' },
    { to: '/tasks', icon: <KanbanSquare className="w-5 h-5" />, label: 'Tasks Board' },
    { to: '/chat', icon: <MessageSquare className="w-5 h-5" />, label: 'Chat Rooms' },
    { to: '/notifications', icon: <Bell className="w-5 h-5" />, label: 'Notifications' },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-screen select-none">
      {/* Brand Logo */}
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 bg-primary flex items-center justify-center rounded-xl shadow-[0_0_15px_rgba(139,92,246,0.3)] animate-pulse">
          <Headset className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <span className="font-bold text-lg tracking-wide text-foreground">MeetIntelli</span>
          <span className="text-xs block text-muted-foreground font-medium -mt-1">Collaboration Hub</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group font-medium ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(139,92,246,0.25)]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <div className="flex items-center gap-3.5">
              {link.icon}
              <span>{link.label}</span>
            </div>
            {link.to === '/notifications' && unreadCount > 0 && (
              <span className="text-[10px] bg-red-500 text-white font-bold px-2 py-0.5 rounded-full select-none animate-pulse">
                {unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile footer */}
      {user && (
        <div className="p-4 border-t border-border bg-background/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src={user.avatar || 'https://api.dicebear.com/7.x/adventurer/svg'}
              alt={user.name}
              className="w-10 h-10 rounded-xl bg-muted border border-border"
            />
            <div className="overflow-hidden">
              <span className="block text-sm font-semibold text-foreground truncate leading-tight">
                {user.name}
              </span>
              <span className="block text-xs text-muted-foreground truncate font-normal">
                {user.email}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
