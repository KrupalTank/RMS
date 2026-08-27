import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axiosInstance';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('rms_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  // Sync profile data on initial page load
  useEffect(() => {
  const fetchProfile = async () => {
    if (user) {
      try {
        const res = await api.get('/user/myProfile');
        if (res.data.success) {
          const profileData = res.data.user || res.data.data;
          setUser(profileData);
          localStorage.setItem('rms_user', JSON.stringify(profileData));
        }
      } catch (err) {
        setUser(null);
        localStorage.removeItem('rms_user');
      }
    }
    setLoading(false);
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