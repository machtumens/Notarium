/**
 * Moderator dashboard — the people-and-content half of the admin console.
 *
 * Shares ConsoleKit with the ops dashboard, so both surfaces read as one tool.
 * Data wiring is untouched: still `useAdminData()`, still the same handlers.
 */
import LoadingSpinner from '../components/LoadingSpinner';
import AdminUsageReport from './AdminUsageReport';
import { Hud, Readout, Readouts, type HudReadout } from '../components/ops/ConsoleKit';
import { displayFace } from '../components/ops/tokens';
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

const t = darkTheme;

const TAB_BLURB: Record<string, string> = {
  users: 'Every account and what it has been up to. Suspensions and warnings are reversible.',
  notes: 'The library as moderators see it — feature, edit, or take a note down.',
  subjects: 'The subject list students file notes under.',
  classes: 'Year groups, class membership, and promoting a year at the end of term.',
  notifications: 'A notification in every targeted student’s inbox. Sent ones can be taken down.',
  usage: 'How much Notarium is being used, and where the gaps are.',
};

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
  const num = (n: number) => n.toLocaleString();

  const hudItems: HudReadout[] = [
    { label: 'Students', value: num(totalUsers) },
    { label: 'Notes', value: num(notesCount) },
    {
      label: 'Suspended',
      value: num(activeSuspensions),
      tone: activeSuspensions > 0 ? 'warn' : undefined,
    },
    {
      label: 'Warnings',
      value: num(activeWarnings),
      tone: activeWarnings > 0 ? 'warn' : undefined,
    },
    { label: 'Classes', value: num(gradeClasses.length) },
    { label: 'Announcements', value: num(sentNotifications.length) },
    { label: 'Logged actions', value: num(activityLogs.length) },
  ];

  return (
    <div>
      <Hud title="Flight Deck" scope="Moderation" items={hudItems} />

      <div style={{ marginBottom: '14px' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: displayFace,
            fontSize: '23px',
            fontWeight: 600,
            letterSpacing: '-.02em',
          }}
        >
          Moderation
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '12.5px',
            color: t.colors.textSecondary,
            maxWidth: '70ch',
          }}
        >
          {TAB_BLURB[activeTab]}
        </p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <Readouts>
          <Readout label="Students" value={num(totalUsers)} delta="on the roll" />
          <Readout
            label="Suspended"
            value={num(activeSuspensions)}
            state={activeSuspensions > 0 ? 'crit' : undefined}
            delta={activeSuspensions > 0 ? 'cannot sign in' : 'none active'}
          />
          <Readout
            label="Active warnings"
            value={num(activeWarnings)}
            state={activeWarnings > 0 ? 'warn' : undefined}
            delta={activeWarnings > 0 ? 'shown on next sign-in' : 'none active'}
          />
          <Readout label="Notes uploaded" value={num(notesCount)} delta="across all students" />
          <Readout label="Year groups" value={num(gradeClasses.length)} />
        </Readouts>
      </div>

      <AdminTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        counts={{
          users: { count: totalUsers },
          classes: { count: gradeClasses.length },
          notifications: { count: sentNotifications.length },
        }}
      />

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
        <LoadingSpinner message="Loading students…" />
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
