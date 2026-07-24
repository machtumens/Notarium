import { darkTheme, cardStyle } from '../../theme';
import type { AdminUser } from './types';
import { safePhotoUrl } from '../../lib/safeUrl';

interface UsersTabProps {
  users: AdminUser[];
  actionLoading: number | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  setWarningUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  setSuspendingUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  handleUnsuspendUser: (userId: number) => Promise<void>;
  handleDeleteUser: (userId: number) => Promise<void>;
  activityLogs: any[];
  showActivityLog: boolean;
  setShowActivityLog: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function UsersTab({
  users,
  actionLoading,
  setSelectedUser,
  setWarningUser,
  setSuspendingUser,
  handleUnsuspendUser,
  handleDeleteUser,
  activityLogs,
  showActivityLog,
  setShowActivityLog,
}: UsersTabProps) {
  return (
    <div>
      {/* Users Section */}
      <div style={{ marginBottom: '48px' }}>
        <h3
          style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '16px',
            color: darkTheme.colors.textPrimary,
          }}
        >
          <i
            className="fas fa-users"
            style={{ marginRight: '8px', color: darkTheme.colors.accent }}
          ></i>
          Users ({users.length})
        </h3>
        <div
          style={
            {
              ...cardStyle,
              padding: 0,
              overflow: 'auto',
              maxHeight: '400px',
            } as React.CSSProperties
          }
        >
          {users.length === 0 ? (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: darkTheme.colors.textSecondary,
              }}
            >
              No users found
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                padding: '16px',
              }}
            >
              {users.map((user) => (
                <div
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  style={{
                    padding: '16px',
                    background: darkTheme.colors.bgSecondary,
                    borderRadius: darkTheme.borderRadius.md,
                    border: `1px solid ${darkTheme.colors.borderColor}`,
                    cursor: 'pointer',
                    transition: darkTheme.transitions.default,
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = darkTheme.shadows.lg;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        background: safePhotoUrl(user.photo_url)
                          ? `url('${safePhotoUrl(user.photo_url)}') center/cover`
                          : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}
                    >
                      {!safePhotoUrl(user.photo_url) &&
                        (user.display_name || user.name)?.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: '600',
                          fontSize: '14px',
                          marginBottom: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.display_name || user.name}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: darkTheme.colors.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ color: darkTheme.colors.textSecondary }}>Points:</span>
                    <span style={{ fontWeight: '600', color: '#fbbf24' }}>
                      {(user as any).points || 0}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ color: darkTheme.colors.textSecondary }}>Total Points:</span>
                    <span style={{ fontWeight: '600', color: darkTheme.colors.accent }}>
                      {user.points || 0}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ color: darkTheme.colors.textSecondary }}>Notes:</span>
                    <span style={{ fontWeight: '600' }}>
                      {user.notes_uploaded || user.notes_count || 0}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '12px',
                    }}
                  >
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: darkTheme.borderRadius.sm,
                        background: user.suspended
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(34, 197, 94, 0.2)',
                        color: user.suspended ? '#fca5a5' : '#86efac',
                        fontSize: '11px',
                        fontWeight: '500',
                      }}
                    >
                      {user.suspended ? 'Suspended' : 'Active'}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!user.suspended && !user.warning && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setWarningUser(user);
                          }}
                          disabled={actionLoading === user.id}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: darkTheme.borderRadius.sm,
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                          }}
                        >
                          Warn
                        </button>
                      )}
                      {!user.suspended ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSuspendingUser(user);
                          }}
                          disabled={actionLoading === user.id}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#fca5a5',
                            border: 'none',
                            borderRadius: darkTheme.borderRadius.sm,
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                          }}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnsuspendUser(user.id);
                          }}
                          disabled={actionLoading === user.id}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: '#86efac',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            borderRadius: darkTheme.borderRadius.sm,
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                          }}
                        >
                          Unsuspend
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUser(user.id);
                        }}
                        disabled={actionLoading === user.id}
                        style={{
                          padding: '4px 8px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#fca5a5',
                          border: 'none',
                          borderRadius: darkTheme.borderRadius.sm,
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Log Section */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3
            style={{
              fontSize: '20px',
              fontWeight: '600',
              margin: 0,
              color: darkTheme.colors.textPrimary,
            }}
          >
            <i
              className="fas fa-history"
              style={{ marginRight: '8px', color: darkTheme.colors.accent }}
            ></i>
            Activity Log ({activityLogs.length})
          </h3>
          <button
            onClick={() => setShowActivityLog(!showActivityLog)}
            style={{
              padding: '8px 16px',
              background: showActivityLog ? darkTheme.colors.accent : darkTheme.colors.bgSecondary,
              border: 'none',
              color: '#fff',
              borderRadius: darkTheme.borderRadius.md,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
            }}
          >
            {showActivityLog ? 'Hide Log' : 'Show Log'}
          </button>
        </div>

        {showActivityLog && (
          <div
            style={
              {
                ...cardStyle,
                padding: 0,
                overflow: 'auto',
                maxHeight: '500px',
              } as React.CSSProperties
            }
          >
            {activityLogs.length === 0 ? (
              <div
                style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: darkTheme.colors.textSecondary,
                }}
              >
                No activity logs yet
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead
                  style={{
                    background: darkTheme.colors.bgSecondary,
                    position: 'sticky',
                    top: 0,
                  }}
                >
                  <tr>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                        fontWeight: '600',
                        fontSize: '13px',
                      }}
                    >
                      Time
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                        fontWeight: '600',
                        fontSize: '13px',
                      }}
                    >
                      Admin
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                        fontWeight: '600',
                        fontSize: '13px',
                      }}
                    >
                      Action
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        textAlign: 'left',
                        borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                        fontWeight: '600',
                        fontSize: '13px',
                      }}
                    >
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.map((log) => (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
                        transition: darkTheme.transitions.default,
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.background = darkTheme.colors.bgSecondary)
                      }
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '13px',
                          color: darkTheme.colors.textSecondary,
                        }}
                      >
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px' }}>{log.admin_email}</td>
                      <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: darkTheme.borderRadius.sm,
                            background:
                              log.action_type === 'like'
                                ? 'rgba(34, 197, 94, 0.2)'
                                : log.action_type === 'edit'
                                  ? 'rgba(59, 130, 246, 0.2)'
                                  : log.action_type === 'delete'
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : 'rgba(156, 163, 175, 0.2)',
                            color:
                              log.action_type === 'like'
                                ? '#86efac'
                                : log.action_type === 'edit'
                                  ? '#60a5fa'
                                  : log.action_type === 'delete'
                                    ? '#fca5a5'
                                    : '#d1d5db',
                            fontSize: '11px',
                            fontWeight: '500',
                            textTransform: 'uppercase',
                          }}
                        >
                          {log.action_type}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          fontSize: '13px',
                          color: darkTheme.colors.textSecondary,
                        }}
                      >
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
