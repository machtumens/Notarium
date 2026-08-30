import { useLocation, useNavigate } from 'react-router-dom';
import { Home, BookOpen, Plus, ClipboardList, Trophy } from 'lucide-react';

// Mobile tab bar — redesign brief option 2h ("Hub · Notes · + · Tests · You").
//
// Replaces reaching for a hamburger in the top-left corner, which on a phone is
// the furthest point from the thumb. The centre "+" is the capture action, given
// visual priority because photographing a page in class is the single most
// frequent thing a student does in this product.
//
// Chrome glass (white 40%, blur 14) per the brief's material spec, and it sits
// above the iOS home indicator via env(safe-area-inset-bottom).

const TABS = [
  { key: 'today', label: 'Today', icon: Home, path: '/' },
  { key: 'notes', label: 'Notes', icon: BookOpen, path: '/my-notes' },
  { key: 'capture', label: 'Capture', icon: Plus, path: '/notes/capture', primary: true },
  { key: 'tests', label: 'Tests', icon: ClipboardList, path: '/quiz' },
  { key: 'you', label: 'You', icon: Trophy, path: '/progress' },
];

export default function MobileTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 4,
        padding: '8px 10px calc(8px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.6)',
        boxShadow: '0 -8px 24px rgba(20, 44, 30, 0.12)',
      }}
    >
      {TABS.map(({ key, label, icon: Icon, path, primary }) => {
        // Exact match for "/" so every route does not light up the Today tab.
        const active = path === '/' ? pathname === '/' : pathname.startsWith(path);

        if (primary) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(path)}
              aria-label="Capture a note"
              style={{
                width: 52,
                height: 52,
                flex: 'none',
                borderRadius: '50%',
                border: 'none',
                marginTop: -18,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#fff',
                background: 'linear-gradient(180deg, #3f9468, #2a6c47)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,.35), 0 10px 22px -8px rgba(42,108,71,.75)',
              }}
            >
              <Icon size={24} />
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            onClick={() => navigate(path)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              // 44px is the minimum comfortable touch target.
              minHeight: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '4px 2px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: active ? '#1f5c3e' : '#3c4f43',
              fontWeight: active ? 700 : 500,
            }}
          >
            <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
            <span style={{ fontSize: 10, letterSpacing: '.01em' }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
