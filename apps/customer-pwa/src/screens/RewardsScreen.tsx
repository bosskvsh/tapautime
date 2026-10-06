import React from 'react';
import { OrdersScreen, OrdersScreenProps } from './OrdersScreen';

export interface RewardsScreenProps {
  onNavigateHome?: () => void;
}

/**
 * RewardsScreen now hosts the Orders page experience,
 * as loyalty points and rewards have been merged into ProfileScreen.
 */
export const RewardsScreen: React.FC<RewardsScreenProps> = ({ onNavigateHome = () => {} }) => {
  return <OrdersScreen onNavigateHome={onNavigateHome} />;
};

export type { OrdersScreenProps };
