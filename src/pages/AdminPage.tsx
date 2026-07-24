import LoadingSpinner from '../components/LoadingSpinner';
import AdminNoteEditModal from '../components/AdminNoteEditModal';
import AdminUsageReport from './AdminUsageReport';
import { darkTheme } from '../theme';
import { useAdminData } from './admin/useAdminData';
import AdminTabs from './admin/AdminTabs';
import ClassesTab from './admin/ClassesTab';
import NotificationsTab from './admin/NotificationsTab';
import UsersTab from './admin/UsersTab';
import SubjectsTab from './admin/SubjectsTab';
import NotesTab from './admin/NotesTab';
import SuspendUserModal from './admin/SuspendUserModal';
import WarnUserModal from './admin/WarnUserModal';
import UserDetailModal from './admin/UserDetailModal';

export default function AdminPage() {
  const {
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
  } = useAdminData();

  const totalUsers = users.length;
  const activeSuspensions = users.filter((u) => u.suspended).length;
  const activeWarnings = users.filter((u) => u.warning).length;
  const notesCount = users.reduce((sum, u) => sum + (u.notes_uploaded || u.notes_count || 0), 0);

  const summaryCards = [
    { label: 'Total Users', value: totalUsers, color: darkTheme.colors.accent },
    { label: 'Active Suspensions', value: activeSuspensions, color: '#fca5a5' },
    { label: 'Active Warnings', value: activeWarnings, color: '#fbbf24' },
    { label: 'Notes Uploaded', value: notesCount, color: '#86efac' },
  ];

  return (
    <div>
      <h2
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '24px',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Admin Dashboard
      </h2>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {summaryCards.map((card) => (
          <div
            key={card.label}
            style={{
              padding: '20px',
              background: darkTheme.colors.bgSecondary,
              borderRadius: darkTheme.borderRadius.md,
              border: `1px solid ${darkTheme.colors.borderColor}`,
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div
              style={{
                fontSize: '13px',
                color: darkTheme.colors.textSecondary,
                marginTop: '4px',
              }}
            >
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <AdminTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'usage' ? (
        <AdminUsageReport />
      ) : activeTab === 'notes' ? (
        <NotesTab />
      ) : activeTab === 'subjects' ? (
        <SubjectsTab />
      ) : activeTab === 'classes' ? (
        <ClassesTab
          users={users}
          gradeClasses={gradeClasses}
          setGradeClasses={setGradeClasses}
          classFormData={classFormData}
          setClassFormData={setClassFormData}
          classActionLoading={classActionLoading}
          setClassActionLoading={setClassActionLoading}
          loadData={loadData}
        />
      ) : activeTab === 'notifications' ? (
        <NotificationsTab
          users={users}
          gradeClasses={gradeClasses}
          notifForm={notifForm}
          setNotifForm={setNotifForm}
          notifLoading={notifLoading}
          setNotifLoading={setNotifLoading}
          sentNotifications={sentNotifications}
          setSentNotifications={setSentNotifications}
        />
      ) : loading ? (
        <LoadingSpinner message="Loading admin data..." />
      ) : (
        <UsersTab
          users={users}
          actionLoading={actionLoading}
          setSelectedUser={setSelectedUser}
          setWarningUser={setWarningUser}
          setSuspendingUser={setSuspendingUser}
          handleUnsuspendUser={handleUnsuspendUser}
          handleDeleteUser={handleDeleteUser}
          activityLogs={activityLogs}
          showActivityLog={showActivityLog}
          setShowActivityLog={setShowActivityLog}
        />
      )}

      {/* Modals */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSaved={loadData}
        />
      )}
      {warningUser && (
        <WarnUserModal
          user={warningUser}
          onClose={() => setWarningUser(null)}
          onWarn={handleWarnUser}
        />
      )}
      {suspendingUser && (
        <SuspendUserModal
          user={suspendingUser}
          onClose={() => setSuspendingUser(null)}
          onSuspend={handleSuspendUser}
        />
      )}
    </div>
  );
}
