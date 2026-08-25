import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import request from '../api/request';

interface User {
  id: number;
  username: string;
  realName: string;
  role: string;
  tenantId: number;
  tenantName: string;
  permissions: string[] | null; // null=全部权限
}

interface Tenant {
  id: number;
  name: string;
  owner_name: string;
  phone: string;
  business_type: string;
  business_desc: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  tenants: Tenant[];
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: number) => Promise<void>;
  loadTenants: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  tenants: [],
  login: async () => {},
  logout: () => {},
  switchTenant: async () => {},
  loadTenants: async () => {},
  loading: true
});

export const useAuth = () => useContext(AuthContext);

// 检查权限的hook
export const useHasPermission = () => {
  const { user } = useAuth();
  return (moduleKey: string): boolean => {
    if (!user) return false;
    if (user.permissions === null || user.permissions === undefined) return true; // owner全部
    if (user.permissions.includes(moduleKey)) return true;
    // 检查父模块
    const parent = moduleKey.split(':')[0];
    if (parent !== moduleKey && user.permissions.includes(parent)) return true;
    return false;
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const loadTenants = useCallback(async () => {
    try {
      const res = await request.get('/tenants');
      const list = res.data?.data || res.data || [];
      setTenants(list);
    } catch (err) {
      console.error('加载帐套列表失败:', err);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const res = await request.post('/auth/login', { username, password });
    const data = res.data?.data || res.data;
    const newToken = data.token;
    const newUser = data.user;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    // 登录成功后加载帐套列表
    setTimeout(() => loadTenants(), 100);
  };

  const switchTenant = async (tenantId: number) => {
    const res = await request.post('/tenants/demo-switch', { tenantId });
    const data = res.data?.data || res.data;
    const newToken = data.token;
    const newUser = data.user;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    // 切换账套后强制刷新页面，确保所有组件重新加载数据
    window.location.href = '/';
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenants([]);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, tenants, login, logout, switchTenant, loadTenants, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
