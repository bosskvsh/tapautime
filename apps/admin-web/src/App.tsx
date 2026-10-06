import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminGuard } from './components/AdminGuard';
import { AdminLayout } from './layouts/AdminLayout';
import { OverviewScreen } from './screens/OverviewScreen';
import { ApplicationsScreen } from './screens/ApplicationsScreen';
import { StallsScreen } from './screens/StallsScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { PayoutsScreen } from './screens/PayoutsScreen';
import { PromoCodesScreen } from './screens/PromoCodesScreen';
import { TapauLinkPROScreen } from './screens/TapauLinkPROScreen';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AdminGuard>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<OverviewScreen />} />
            <Route path="/applications" element={<ApplicationsScreen />} />
            <Route path="/stalls" element={<StallsScreen />} />
            <Route path="/orders" element={<OrdersScreen />} />
            <Route path="/payouts" element={<PayoutsScreen />} />
            <Route path="/promo-codes" element={<PromoCodesScreen />} />
            <Route path="/tapaulinkpro" element={<TapauLinkPROScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AdminGuard>
    </BrowserRouter>
  );
};
