import { useState, useEffect } from 'react';
import api from '../lib/api';
import type { AppNotification } from '../types';
import { formatDate as formatInStudentZone } from '../lib/datetime';

interface NotificationPanelProps {
  onClose: () => void;
  onCountChange: (count: number) => void;
}

const TYPE_STYLES: Record<string, { badge: string; dot: string }> = {
  announcement: {
    badge: 'bg-[#3e7d8c]/20 text-[#3e7d8c] border-[#3e7d8c]/30',
    dot: 'bg-[#3e7d8c]',
  },
  class_reassignment: {
    badge: 'bg-amber-500/20 text-[#b98a3f] border-amber-500/30',
    dot: 'bg-amber-400',
  },
  warning: { badge: 'bg-[#bf6b4f]/20 text-[#bf6b4f] border-[#bf6b4f]/30', dot: 'bg-red-400' },
};

const formatDate = (dateStr: string) => formatInStudentZone(dateStr);

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
        className="relative w-full max-w-sm h-full bg-white/70 border-l border-[#1c2a22]/10 shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1c2a22]/10">
          <div className="flex items-center gap-2">
            <span className="text-[#1c2a22] font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-[#bf6b4f] text-[#1c2a22] text-xs font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[#3c4f43] hover:text-[#1c2a22] transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#3c4f43] hover:text-[#1c2a22] transition-colors p-1"
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
              <div className="w-5 h-5 border-2 border-[#1c2a22]/[0.12] border-t-white rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#5b6f62] gap-2">
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
                    className={`px-4 py-3 cursor-pointer hover:bg-white/60/50 transition-colors ${n.is_read ? 'opacity-60' : ''}`}
                    onClick={() => n.is_read === 0 && handleMarkRead(n.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-[#3c4f43]/15' : style.dot}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded border font-medium ${style.badge}`}
                          >
                            {n.notification_type.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-[#5b6f62]">{formatDate(n.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-[#1c2a22] mb-0.5 truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-[#3c4f43] leading-relaxed">{n.message}</p>
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
