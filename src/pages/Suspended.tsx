import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function Suspended() {
  const navigate = useNavigate();
  const [suspensionData, setSuspensionData] = useState<{
    daysRemaining: number;
    reason: string;
    endDate: string;
  } | null>(null);

  useEffect(() => {
    // Check if user is actually suspended
    const checkSuspension = async () => {
      try {
        const response = await api.auth.me();
        if (!response.user.suspended) {
          // Not suspended, redirect to home
          navigate('/', { replace: true });
          return;
        }

        // Calculate days remaining
        const endDate = new Date(response.user.suspension_end_date);
        const now = new Date();
        const daysRemaining = Math.ceil(
          (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        setSuspensionData({
          daysRemaining,
          reason: response.user.suspension_reason || 'Violation of community guidelines',
          endDate: response.user.suspension_end_date,
        });
      } catch (error) {
        // If error, redirect to login
        navigate('/login', { replace: true });
      }
    };

    checkSuspension();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  if (!suspensionData) {
    return null; // Loading state
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          border: '2px solid #ff4444',
          borderRadius: '12px',
          padding: '40px',
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(255, 68, 68, 0.3)',
        }}
      >
        <div
          style={{
            fontSize: '48px',
            marginBottom: '20px',
          }}
        >
          ⛔
        </div>

        <h1
          style={{
            color: '#ff4444',
            fontSize: '28px',
            marginBottom: '20px',
            fontWeight: 'bold',
          }}
        >
          Account Suspended
        </h1>

        <div
          style={{
            backgroundColor: '#2a2a2a',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px',
            border: '1px solid #333',
          }}
        >
          <p
            style={{
              color: '#fff',
              fontSize: '18px',
              marginBottom: '16px',
              lineHeight: '1.6',
            }}
          >
            Suspended for{' '}
            <strong style={{ color: '#ff4444' }}>{suspensionData.daysRemaining} days</strong> for:
          </p>

          <p
            style={{
              color: '#ffaa00',
              fontSize: '16px',
              fontStyle: 'italic',
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#1a1a1a',
              borderRadius: '6px',
            }}
          >
            "{suspensionData.reason}"
          </p>

          <p
            style={{
              color: '#aaa',
              fontSize: '14px',
            }}
          >
            According to admin
          </p>
        </div>

        <p
          style={{
            color: '#999',
            fontSize: '14px',
            marginBottom: '24px',
          }}
        >
          Your account will be automatically reactivated on{' '}
          <strong style={{ color: '#fff' }}>
            {new Date(suspensionData.endDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </strong>
        </p>

        <button
          onClick={handleLogout}
          style={{
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '12px 24px',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#444';
            e.currentTarget.style.borderColor = '#666';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#333';
            e.currentTarget.style.borderColor = '#555';
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
