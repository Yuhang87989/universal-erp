import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Purchase from './pages/Purchase';
import Sales from './pages/Sales';
import Finance from './pages/Finance';
import Suppliers from './pages/Suppliers';
import Reports from './pages/Reports';
import Customers from './pages/Customers';
import Ecommerce from './pages/Ecommerce';
import Settings from './pages/Settings';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="purchase" element={<Purchase />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="sales" element={<Sales />} />
        <Route path="pos" element={<POS />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="finance" element={<Finance />} />
        <Route path="products" element={<Products />} />
        <Route path="customers" element={<Customers />} />
        <Route path="reports" element={<Reports />} />
        <Route path="ecommerce" element={<Ecommerce />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default App;
