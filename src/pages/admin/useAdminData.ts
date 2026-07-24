import { useState, useEffect } from 'react';
import api from '../../lib/api';
import type { AdminUser } from './types';
import type { AdminTab } from './AdminTabs';

export function useAdminData() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [gradeClasses, setGradeClasses] = useState<any[]>([]);
  const [classFormData, setClassFormData] = useState({ grade: '', class_name: '', semester: '' });
  const [classActionLoading, setClassActionLoading] = useState(false);
  const [sentNotifications, setSentNotifications] = useState<any[]>([]);
  const [notifForm, setNotifForm] = useState({
    target_type: 'all',
    target_grade: '',
    target_class: '',
    target_user_id: '',
    notification_type: 'announcement',
    title: '',
    message: '',
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [suspendingUser, setSuspendingUser] = useState<AdminUser | null>(null);
  const [warningUser, setWarningUser] = useState<AdminUser | null>(null);
  const [showActivityLog, setShowActivityLog] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the mount effect; behavior-preserving
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, logsData, classesData, notifsData] = await Promise.all([
        api.admin.getUsers(),
        loadActivityLogs(),
        api.admin.getGradeClasses().catch(() => ({ grade_classes: [] })),
        api.admin.getNotifications().catch(() => ({ notifications: [] })),
      ]);
      setUsers(usersData.users || []);
      setActivityLogs(logsData);
      setGradeClasses((classesData as any).grade_classes || []);
      setSentNotifications((notifsData as any).notifications || []);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    try {
      const response = await api.request('/api/admin/activity-log?limit=50', {
        method: 'GET',
      });
      return response.logs || [];
    } catch (error) {
      console.error('Failed to load activity logs:', error);
      return [];
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      setActionLoading(userId);
      await api.admin.deleteUser(userId);
      setUsers(users.filter((u) => u.id !== userId));
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspendUser = async (userId: number, days: number, reason: string) => {
    try {
      setActionLoading(userId);
      await api.admin.suspendUser(userId, days, reason);
      await loadData();
    } catch (error) {
      console.error('Failed to suspend user:', error);
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleWarnUser = async (userId: number, message: string) => {
    try {
      setActionLoading(userId);
      await api.admin.warnUser(userId, message);
      await loadData();
    } catch (error) {
      console.error('Failed to warn user:', error);
      throw error;
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsuspendUser = async (userId: number) => {
    if (!confirm('Are you sure you want to remove the suspension from this user?')) {
      return;
    }
    try {
      setActionLoading(userId);
      await api.admin.unsuspendUser(userId);
      await loadData();
    } catch (error) {
      console.error('Failed to unsuspend user:', error);
      alert('Failed to unsuspend user');
    } finally {
      setActionLoading(null);
    }
  };

  return {
    activeTab,
    setActiveTab,
    users,
    gradeClasses,
    setGradeClasses,
    classFormData,
    setClassFormData,
    classActionLoading,
    setClassActionLoading,
    sentNotifications,
    setSentNotifications,
    notifForm,
    setNotifForm,
    notifLoading,
    setNotifLoading,
    activityLogs,
    loading,
    actionLoading,
    selectedUser,
    setSelectedUser,
    suspendingUser,
    setSuspendingUser,
    warningUser,
    setWarningUser,
    showActivityLog,
    setShowActivityLog,
    loadData,
    handleDeleteUser,
    handleSuspendUser,
    handleWarnUser,
    handleUnsuspendUser,
  };
}
