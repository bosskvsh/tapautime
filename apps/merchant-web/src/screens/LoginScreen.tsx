import React from 'react';
import { AuthScreen } from './AuthScreen';

interface LoginScreenProps {
  onSuccess?: () => void;
  onNavigateToOnboarding?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = (props) => {
  return <AuthScreen {...props} />;
};

export default LoginScreen;
