import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api/v1/rms',
  withCredentials: true, // Crucial: passes the HttpOnly rms_token cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for session expiration handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear client session state if unauthorized
      localStorage.removeItem('rms_user');
    }
    return Promise.reject(error);
  }
);

export default api;