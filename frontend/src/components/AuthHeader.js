import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

const AuthHeader = () => {
  const { user, logout, loading, isAuthenticated } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  if (loading) {
    return (
      <div className="auth-header" style={{ marginBottom: 16 }}>
        <span style={{ color: '#666' }}>Loading...</span>
      </div>
    );
  }

  const handleSwitchToSignup = () => {
    setShowLogin(false);
    setShowSignup(true);
  };

  const handleSwitchToLogin = () => {
    setShowSignup(false);
    setShowLogin(true);
  };

  const handleCloseModals = () => {
    setShowLogin(false);
    setShowSignup(false);
  };

  return (
    <>
      <div className="auth-header" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 12, 
        marginBottom: 16,
        padding: '8px 0',
        borderBottom: '1px solid #e5e7eb'
      }}>
        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#374151', fontSize: 14 }}>
              Welcome, <strong>{user.email}</strong>
            </span>
            <button
              onClick={logout}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#6b7280', fontSize: 14 }}>
              Access restricted to @turing emails
            </span>
            <button
              onClick={() => setShowLogin(true)}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Login
            </button>
            <button
              onClick={() => setShowSignup(true)}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Sign Up
            </button>
          </div>
        )}
      </div>

      {showLogin && (
        <LoginForm
          onClose={handleCloseModals}
          onSwitchToSignup={handleSwitchToSignup}
        />
      )}

      {showSignup && (
        <SignupForm
          onClose={handleCloseModals}
          onSwitchToLogin={handleSwitchToLogin}
        />
      )}
    </>
  );
};

export default AuthHeader;
