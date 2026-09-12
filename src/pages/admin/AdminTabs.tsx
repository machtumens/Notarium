import { Tabs } from '../../components/ops/ConsoleKit';

export type AdminTab = 'users' | 'notes' | 'subjects' | 'classes' | 'notifications' | 'usage';

interface AdminTabsProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  /** Optional counts rendered as chips, e.g. how many students are on the roll. */
  counts?: Partial<Record<AdminTab, { count: number; hot?: boolean }>>;
}

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'users', label: 'Students' },
  { key: 'notes', label: 'Notes' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'classes', label: 'Classes' },
  { key: 'notifications', label: 'Announcements' },
  { key: 'usage', label: 'Usage report' },
];

export default function AdminTabs({ activeTab, setActiveTab, counts }: AdminTabsProps) {
  return (
    <Tabs
      label="Moderation sections"
      active={activeTab}
      onChange={setActiveTab}
      tabs={TABS.map((tab) => ({
        ...tab,
        count: counts?.[tab.key]?.count,
        hot: counts?.[tab.key]?.hot,
      }))}
    />
  );
}
