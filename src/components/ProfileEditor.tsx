import { useState, useRef, useEffect } from 'react';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { useAuth } from '../App';
import {
  darkTheme,
  modalOverlayStyle,
  modalContentStyle,
  inputStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
} from '../theme';
import CameraCapture from './CameraCapture';
import type { ProfileUpdateData } from '../types';

interface ProfileEditorProps {
  onClose: () => void;
}

export default function ProfileEditor({ onClose }: ProfileEditorProps) {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const [name, setName] = useState(user?.name || '');
  const [selectedClass, setSelectedClass] = useState(user?.class || '10.1');
  const [description, setDescription] = useState(user?.description || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photo_url || null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedProfile = localStorage.getItem('profileData');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrates form fields from localStorage on mount; behavior-preserving
        if (profile.name) setName(profile.name);
        if (profile.description) setDescription(profile.description);
        if (profile.class) setSelectedClass(profile.class);
      } catch (e) {
        logger.debug('profile', 'Failed to load saved profile data');
      }
    }
  }, []);

  const processImageFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError('Image too large. Please choose an image smaller than 2MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      logger.debug('profile', 'Photo upload:', { originalSize: file.size, fileType: file.type });
      setPhotoBase64(base64String);
      setPhotoPreview(base64String);
      setError('');
      setShowPhotoOptions(false);
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const updateData: ProfileUpdateData = { name, class: selectedClass, description };
      if (photoBase64) {
        updateData.photo_url = photoBase64;
      }

      localStorage.setItem(
        'profileData',
        JSON.stringify({
          name,
          description,
          class: selectedClass,
        }),
      );

      await api.updateProfile(updateData);
      await refreshUser();

      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    try {
      setPasswordLoading(true);
      await api.request('/api/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
        },
      });

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setPasswordSuccess(false);
        setShowPasswordChange(false);
      }, 2000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const isMobile = window.innerWidth < 768;

  return (
    <div style={modalOverlayStyle} onClick={() => showPhotoOptions && setShowPhotoOptions(false)}>
      <div
        style={{
          ...modalContentStyle,
          maxWidth: isMobile ? '95%' : '500px',
          maxHeight: isMobile ? '85vh' : '90vh',
          padding: isMobile ? '16px' : '32px',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isMobile ? '16px' : '24px',
          }}
        >
          <h2
            style={{
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: 'bold',
              color: '#fff',
              margin: 0,
            }}
          >
            Edit Profile
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: darkTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '24px',
              transition: darkTheme.transitions.default,
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = darkTheme.colors.textSecondary)}
          >
            ✕
          </button>
        </div>

        {/* Main Content - Vertical Layout for All Screens */}
        <div
          style={{
            display: 'flex',
            gap: '24px',
            alignItems: 'center',
            flexDirection: 'column',
            width: '100%',
          }}
        >
          {/* Profile Picture and Stats Section */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'center',
              gap: '20px',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            {/* Profile Picture with Pen Icon Overlay */}
            <div style={{ cursor: 'pointer', position: 'relative', display: 'block' }}>
              <div
                onClick={() => setShowPhotoOptions(!showPhotoOptions)}
                style={{
                  width: isMobile ? '80px' : '120px',
                  height: isMobile ? '80px' : '120px',
                  borderRadius: '50%',
                  background: photoPreview
                    ? `url('${photoPreview}') center/cover`
                    : `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: isMobile ? '32px' : '48px',
                  border: `3px solid ${darkTheme.colors.borderColor}`,
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.boxShadow = `0 0 24px ${darkTheme.colors.accent}`;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {!photoPreview && user?.name?.charAt(0).toUpperCase()}

                {/* Pen Icon Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: darkTheme.colors.accent,
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '18px',
                    border: `2px solid ${darkTheme.colors.bgPrimary}`,
                    transition: 'transform 0.3s ease',
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ✏️
                </div>
              </div>

              {/* Photo Options Popup */}
              {showPhotoOptions && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '12px',
                    background: darkTheme.colors.bgPrimary,
                    border: `1px solid ${darkTheme.colors.borderColor}`,
                    borderRadius: '12px',
                    padding: '12px',
                    minWidth: '180px',
                    zIndex: 1000,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  {/* Camera Option */}
                  <button
                    onClick={() => {
                      setShowCamera(true);
                      setShowPhotoOptions(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: darkTheme.colors.bgSecondary,
                      border: 'none',
                      color: '#fff',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      marginBottom: '8px',
                      transition: darkTheme.transitions.default,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      justifyContent: 'center',
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = darkTheme.colors.bgSecondary)
                    }
                  >
                    📷 Take Picture
                  </button>

                  {/* File Upload Option */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: darkTheme.colors.bgSecondary,
                      border: 'none',
                      color: '#fff',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: darkTheme.transitions.default,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      justifyContent: 'center',
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = darkTheme.colors.bgSecondary)
                    }
                  >
                    📁 Choose File
                  </button>
                </div>
              )}
            </div>

            {/* Hidden Camera Input */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              style={{ display: 'none' }}
            />

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />

            {/* Notes Count Display */}
            <div
              style={{
                background: 'linear-gradient(135deg, #f39c12, #e74c3c, #9b59b6)',
                borderRadius: '16px',
                padding: isMobile ? '12px 20px' : '16px 28px',
                color: 'white',
                boxShadow: '0 8px 24px rgba(243, 156, 18, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                minWidth: isMobile ? '140px' : '180px',
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? '28px' : '40px',
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                📚
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: isMobile ? '24px' : '32px',
                    fontWeight: 'bold',
                    lineHeight: 1.1,
                  }}
                >
                  {user?.notes_count || 0}
                </div>
                <div
                  style={{
                    fontSize: isMobile ? '11px' : '13px',
                    opacity: 0.9,
                    fontWeight: '500',
                    lineHeight: 1.2,
                  }}
                >
                  Notes
                </div>
              </div>
            </div>
          </div>

          {/* Form Fields Section */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              width: '100%',
            }}
          >
            {/* Username */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#fff',
                  marginBottom: '8px',
                }}
              >
                Username
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  ...(inputStyle as React.CSSProperties),
                  padding: window.innerWidth < 768 ? '12px 14px' : undefined,
                  fontSize: window.innerWidth < 768 ? '16px' : undefined,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                placeholder="Your display name"
                onFocus={(e) => (e.currentTarget.style.borderColor = darkTheme.colors.accent)}
                onBlur={(e) => (e.currentTarget.style.borderColor = darkTheme.colors.borderColor)}
              />
            </div>

            {/* Description */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#fff',
                  marginBottom: '8px',
                }}
              >
                Profile Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  ...(inputStyle as React.CSSProperties),
                  minHeight: window.innerWidth < 768 ? '100px' : '80px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  padding: window.innerWidth < 768 ? '12px 14px' : '10px 12px',
                  fontSize: window.innerWidth < 768 ? '14px' : '13px',
                  width: '100%',
                  boxSizing: 'border-box',
                  lineHeight: '1.4',
                }}
                placeholder="Write a short description about yourself..."
                maxLength={200}
                onFocus={(e) => (e.currentTarget.style.borderColor = darkTheme.colors.accent)}
                onBlur={(e) => (e.currentTarget.style.borderColor = darkTheme.colors.borderColor)}
              />
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                  textAlign: 'right',
                }}
              >
                {description.length}/200
              </div>
            </div>

            {/* Class Selection (Students only) */}
            {user?.role === 'student' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#fff',
                    marginBottom: '8px',
                  }}
                >
                  Class
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      window.innerWidth < 768 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                    gap: '8px',
                  }}
                >
                  {['10.1', '10.2', '10.3'].map((classOption) => (
                    <button
                      key={classOption}
                      type="button"
                      onClick={() => setSelectedClass(classOption)}
                      style={{
                        padding: '12px',
                        borderRadius: darkTheme.borderRadius.md,
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        transition: darkTheme.transitions.default,
                        background:
                          selectedClass === classOption
                            ? `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`
                            : darkTheme.colors.bgSecondary,
                        color:
                          selectedClass === classOption ? '#fff' : darkTheme.colors.textSecondary,
                        boxShadow:
                          selectedClass === classOption ? darkTheme.shadows.default : 'none',
                      }}
                      onMouseOver={(e) => {
                        if (selectedClass !== classOption) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (selectedClass !== classOption) {
                          e.currentTarget.style.background = darkTheme.colors.bgSecondary;
                        }
                      }}
                    >
                      {classOption}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Password Change Section */}
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                background: darkTheme.colors.bgTertiary,
                borderRadius: darkTheme.borderRadius.md,
                border: `1px solid ${darkTheme.colors.borderColor}`,
              }}
            >
              <button
                type="button"
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                style={{
                  width: '100%',
                  padding: isMobile ? '10px' : '12px',
                  background: 'transparent',
                  border: 'none',
                  color: darkTheme.colors.textPrimary,
                  fontSize: isMobile ? '13px' : '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: darkTheme.transitions.default,
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = darkTheme.colors.accent)}
                onMouseOut={(e) => (e.currentTarget.style.color = darkTheme.colors.textPrimary)}
              >
                <span>
                  <i className="fas fa-lock" style={{ marginRight: '8px' }}></i>
                  Change Password
                </span>
                <i className={`fas fa-chevron-${showPasswordChange ? 'up' : 'down'}`}></i>
              </button>

              {showPasswordChange && (
                <div style={{ marginTop: '16px' }}>
                  {/* Current Password */}
                  <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: '500',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      style={
                        {
                          ...inputStyle,
                          fontSize: isMobile ? '13px' : '14px',
                          padding: isMobile ? '10px 12px' : '12px 14px',
                        } as React.CSSProperties
                      }
                    />
                  </div>

                  {/* New Password */}
                  <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: '500',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      style={
                        {
                          ...inputStyle,
                          fontSize: isMobile ? '13px' : '14px',
                          padding: isMobile ? '10px 12px' : '12px 14px',
                        } as React.CSSProperties
                      }
                    />
                  </div>

                  {/* Confirm New Password */}
                  <div style={{ marginBottom: isMobile ? '12px' : '16px' }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '6px',
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: '500',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      style={
                        {
                          ...inputStyle,
                          fontSize: isMobile ? '13px' : '14px',
                          padding: isMobile ? '10px 12px' : '12px 14px',
                        } as React.CSSProperties
                      }
                    />
                  </div>

                  {/* Password Error/Success Messages */}
                  {passwordError && (
                    <div
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        color: '#fca5a5',
                        padding: isMobile ? '8px 12px' : '10px 14px',
                        borderRadius: darkTheme.borderRadius.md,
                        fontSize: isMobile ? '12px' : '13px',
                        marginBottom: '12px',
                      }}
                    >
                      <i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i>
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div
                      style={{
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.5)',
                        color: '#86efac',
                        padding: isMobile ? '8px 12px' : '10px 14px',
                        borderRadius: darkTheme.borderRadius.md,
                        fontSize: isMobile ? '12px' : '13px',
                        marginBottom: '12px',
                      }}
                    >
                      <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>
                      Password changed successfully!
                    </div>
                  )}

                  {/* Change Password Button */}
                  <button
                    onClick={handlePasswordChange}
                    disabled={passwordLoading}
                    style={{
                      width: '100%',
                      padding: isMobile ? '10px' : '12px',
                      background: passwordLoading
                        ? darkTheme.colors.accent + '80'
                        : darkTheme.colors.accent,
                      color: 'white',
                      border: 'none',
                      borderRadius: darkTheme.borderRadius.md,
                      fontSize: isMobile ? '13px' : '14px',
                      fontWeight: '600',
                      cursor: passwordLoading ? 'not-allowed' : 'pointer',
                      transition: darkTheme.transitions.default,
                      opacity: passwordLoading ? 0.6 : 1,
                    }}
                    onMouseOver={(e) => {
                      if (!passwordLoading)
                        e.currentTarget.style.background = darkTheme.colors.accentHover;
                    }}
                    onMouseOut={(e) => {
                      if (!passwordLoading)
                        e.currentTarget.style.background = darkTheme.colors.accent;
                    }}
                  >
                    {passwordLoading ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              )}
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fca5a5',
                  padding: '12px 16px',
                  borderRadius: darkTheme.borderRadius.md,
                  fontSize: '14px',
                }}
              >
                {error}
              </div>
            )}
            {success && (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.5)',
                  color: '#86efac',
                  padding: '12px 16px',
                  borderRadius: darkTheme.borderRadius.md,
                  fontSize: '14px',
                }}
              >
                Profile updated successfully!
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '8px',
              }}
            >
              <button
                onClick={onClose}
                style={
                  {
                    ...buttonSecondaryStyle,
                    flex: 1,
                  } as React.CSSProperties
                }
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')
                }
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                style={
                  {
                    ...buttonPrimaryStyle,
                    flex: 1,
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  } as React.CSSProperties
                }
                onMouseOver={(e) =>
                  !loading && (e.currentTarget.style.boxShadow = darkTheme.shadows.lg)
                }
                onMouseOut={(e) => (e.currentTarget.style.boxShadow = darkTheme.shadows.default)}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Capture Modal */}
      {showCamera && (
        <CameraCapture
          onCapture={(photoBase64) => {
            setPhotoBase64(photoBase64);
            setPhotoPreview(photoBase64);
            setShowCamera(false);
            setError('');
          }}
          onClose={() => setShowCamera(false)}
          title="Take Profile Picture"
          facingMode="user"
        />
      )}
    </div>
  );
}
