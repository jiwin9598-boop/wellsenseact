import axios from 'axios';

let csrfToken = localStorage.getItem('wellsense_csrf') || '';

export const setStoredCsrf = (token) => {
  csrfToken = token || '';
  if (token) {
    localStorage.setItem('wellsense_csrf', token);
  } else {
    localStorage.removeItem('wellsense_csrf');
  }
};

export const getStoredCsrf = () => {
  return csrfToken || localStorage.getItem('wellsense_csrf') || '';
};

export const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getStoredCsrf();
    if (token) {
      config.headers['X-WellSense-CSRF'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
