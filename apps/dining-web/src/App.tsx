import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { MenuScreen } from './screens/MenuScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { SuccessScreen } from './screens/SuccessScreen';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto shadow-xl">
        <Routes>
          <Route path="/:merchantSlug/:tableNumber" element={<MenuScreen />} />
          <Route path="/:merchantSlug/:tableNumber/checkout" element={<CheckoutScreen />} />
          <Route path="/:merchantSlug/:tableNumber/success" element={<SuccessScreen />} />
          <Route path="*" element={<div className="p-4 text-center">Invalid QR Code</div>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
