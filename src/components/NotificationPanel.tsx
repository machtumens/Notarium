import { useState, useEffect } from 'react';
import api from '../lib/api';
import type { AppNotification } from '../types';

interface NotificationPanelProps {
  onClose: () => void;
  onCountChange: (count: number) => void;
}

const TYPE_STYLES: Record<string, { badge: string; dot: string }> = {
  announcement: { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
  class_reassignment: {
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  warning: { badge: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NotificationPanel({ onClose, onCountChange }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const res = await api.notifications.getAll();
      setNotifications(res.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets loading/notification state on mount; behavior-preserving
    loadNotifications();
  }, []);

  const handleMarkRead = async (id: number) => {
    await api.notifications.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 as const } : n)));
    const unread = notifications.filter((n) => n.id !== id && n.is_read === 0).length;
    onCountChange(unread);
  };

  const handleMarkAllRead = async () => {
    await api.notifications.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 as const })));
    onCountChange(0);
  };

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="relative w-full max-w-sm h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="text-sm">No notifications</span>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {notifications.map((n) => {
                const style = TYPE_STYLES[n.notification_type] || TYPE_STYLES.announcement;
                return (
                  <li
                    key={n.id}
                    className={`px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition-colors ${n.is_read ? 'opacity-60' : ''}`}
                    onClick={() => n.is_read === 0 && handleMarkRead(n.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-zinc-600' : style.dot}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded border font-medium ${style.badge}`}
                          >
                            {n.notification_type.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-zinc-500">{formatDate(n.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-white mb-0.5 truncate">{n.title}</p>
                        <p className="text-xs text-zinc-400 leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
