import { darkTheme } from '../../theme';

export type AdminTab = 'users' | 'notes' | 'subjects' | 'classes' | 'notifications' | 'usage';

interface AdminTabsProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
}

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'users', label: 'Users & Activity' },
  { key: 'notes', label: 'Notes' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'classes', label: 'Classes' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'usage', label: 'Usage Report' },
];

export default function AdminTabs({ activeTab, setActiveTab }: AdminTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: `2px solid ${darkTheme.colors.borderColor}`,
        flexWrap: 'wrap',
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            color: activeTab === tab.key ? darkTheme.colors.accent : darkTheme.colors.textSecondary,
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderBottom:
              activeTab === tab.key
                ? `3px solid ${darkTheme.colors.accent}`
                : '3px solid transparent',
            marginBottom: '-2px',
            transition: darkTheme.transitions.default,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
