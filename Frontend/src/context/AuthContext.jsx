// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axiosInstance';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('rms_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Keep loading true on mount if a saved user exists, so ProtectedRoute waits for sync
  const [loading, setLoading] = useState(true);

  // Sync profile data on initial page load / hard refresh
  useEffect(() => {
    const fetchProfile = async () => {
      const savedUser = localStorage.getItem('rms_user');

      // If no stored user exists in storage, stop loading immediately
      if (!savedUser) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/user/myProfile');
        if (res.data.success) {
          const profileData = res.data.user || res.data.data;
          setUser(profileData);
          localStorage.setItem('rms_user', JSON.stringify(profileData));
        }
      } catch (err) {
        // ONLY log out if the server explicitly rejects the auth token/session (401 or 403)
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          console.warn('Session expired or unauthorized. Logging out.');
          setUser(null);
          localStorage.removeItem('rms_user');
        } else {
          // For network drops or temporary errors, retain cached user from localStorage
          console.warn('Could not refresh profile from server, keeping offline session:', err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('rms_user', JSON.stringify(userData));
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      setUser(null);
      localStorage.removeItem('rms_user');
    }
  };

  const updateUserKyc = (newKycStatus) => {
    setUser((prev) => {
      const updated = { ...prev, kyc_status: newKycStatus };
      localStorage.setItem('rms_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUserKyc, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);