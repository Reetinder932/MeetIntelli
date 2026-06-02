import axios from 'axios';

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:8081';
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && token !== 'authenticated_session') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const authApi = {
  login: (credentials: any) => api.post('/api/auth/login', credentials),
  register: (userData: any) => api.post('/api/auth/register', userData),
  logout: () => api.post('/api/auth/logout'),
  sendOtp: (email: string) => api.post(`/api/auth/send-otp?email=${encodeURIComponent(email)}`),
  verifyOtp: (email: string, otp: string) => api.post(`/api/auth/verify-otp?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}`),
  forgotPasswordSendOtp: (email: string) => api.post(`/api/auth/forgot-password/send-otp?email=${encodeURIComponent(email)}`),
  forgotPasswordReset: (email: string, otp: string, newPassword: string) => api.post(`/api/auth/forgot-password/reset?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}&newPassword=${encodeURIComponent(newPassword)}`),
  me: () => api.get(`/api/auth/me?t=${Date.now()}`),
};

export const meetingApi = {
  list: () => api.get(`/api/meetings?t=${Date.now()}`),
  get: (id: number) => api.get(`/api/meetings/${id}?t=${Date.now()}`),
  upload: (file: File, title?: string, onUploadProgress?: (progressEvent: any) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) {
      formData.append('title', title);
    }
    return api.post('/api/meetings/upload', formData, { onUploadProgress });
  },
  chat: (id: number, question: string) =>
    api.post(`/api/meetings/${id}/chat`, { question }),
  joinBot: (url: string, title?: string) =>
    api.post(`/api/meetings/bot/join?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || '')}`),
  stopBot: (meetingId: number) =>
    api.post(`/api/meetings/bot/stop?meetingId=${meetingId}`),
};

export const taskApi = {
  list: (myOnly = false) => api.get(`/api/tasks?my=${myOnly}&t=${Date.now()}`),
  create: (task: any) => api.post('/api/tasks', task),
  updateStatus: (id: number, status: string) =>
    api.put(`/api/tasks/${id}/status?status=${status}`),
  assign: (id: number, userId: number) =>
    api.put(`/api/tasks/${id}/assign?userId=${userId}`),
  acceptSuggestion: (id: number) => api.post(`/api/tasks/${id}/accept`),
  rejectSuggestion: (id: number) => api.post(`/api/tasks/${id}/reject`),
  acceptNewSuggestedTask: (id: number) => api.post(`/api/tasks/${id}/accept-new`),
  deleteTask: (id: number) => api.delete(`/api/tasks/${id}`),
};

export const chatApi = {
  rooms: () => api.get(`/api/chat/rooms?t=${Date.now()}`),
  myRooms: () => api.get(`/api/chat/rooms/my?t=${Date.now()}`),
  createRoom: (name: string, description?: string) =>
    api.post(`/api/chat/rooms?name=${name}&description=${description || ''}`),
  history: (roomId: number) => api.get(`/api/chat/rooms/${roomId}/history?t=${Date.now()}`),
  join: (roomId: number) => api.post(`/api/chat/rooms/${roomId}/join`),
  leave: (roomId: number) => api.post(`/api/chat/rooms/${roomId}/leave`),
  users: () => api.get(`/api/chat/users?t=${Date.now()}`),
  uploadMedia: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/api/chat/media', formData);
  },
};

export const notificationApi = {
  list: () => api.get(`/api/notifications?t=${Date.now()}`),
  unread: () => api.get(`/api/notifications/unread?t=${Date.now()}`),
  read: (id: number) => api.post(`/api/notifications/${id}/read`),
};

export const teamApi = {
  list: () => api.get(`/api/teams?t=${Date.now()}`),
  create: (name: string, description?: string) =>
    api.post(`/api/teams?name=${name}&description=${description || ''}`),
  join: (id: number) => api.post(`/api/teams/${id}/join`),
  leave: (id: number) => api.post(`/api/teams/${id}/leave`),
};

export default api;
