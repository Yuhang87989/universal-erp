import axios from 'axios';

const request = axios.create({
  baseURL: '/api',
  timeout: 15000
});

// 请求拦截器：自动附加Token
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一错误处理，返回原始response对象
request.interceptors.response.use(
  response => {
    const data = response.data;
    // 业务错误（code不为0）
    if (data && typeof data === 'object' && 'code' in data && data.code !== 0) {
      return Promise.reject(new Error(data.message || '请求失败'));
    }
    return response;
  },
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default request;
