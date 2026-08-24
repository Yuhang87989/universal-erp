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
import VoucherList from './pages/Finance/VoucherList';
import Accounts from './pages/Finance/Accounts';
import TrialBalance from './pages/Finance/TrialBalance';
import SealManagement from './pages/Finance/Seals';
import Stocktake from './pages/Inventory/Stocktake';
import Warehouses from './pages/Warehouse/Warehouses';
import StockIn from './pages/Warehouse/StockIn';
import StockOut from './pages/Warehouse/StockOut';
import StockTransfer from './pages/Warehouse/StockTransfer';
import PaymentSettings from './pages/Finance/PaymentSettings';
import Analytics from './pages/Analytics';
import Alerts from './pages/Alerts';
import AICenter from './pages/AI';

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
        <Route path="stocktake" element={<Stocktake />} />
        <Route path="finance" element={<Finance />} />
        <Route path="vouchers" element={<VoucherList />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="trial-balance" element={<TrialBalance />} />
        <Route path="seals" element={<SealManagement />} />
        <Route path="payment-settings" element={<PaymentSettings />} />
        <Route path="warehouses" element={<Warehouses />} />
        <Route path="stock-in" element={<StockIn />} />
        <Route path="stock-out" element={<StockOut />} />
        <Route path="transfers" element={<StockTransfer />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="ai" element={<AICenter />} />
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
