import React from 'react';
import {
  Apple,
  Beef,
  CakeSlice,
  Croissant,
  CupSoda,
  HeartHandshake,
  Leaf,
  Milk,
  ShoppingBasket,
  Snowflake,
  Sparkles,
} from 'lucide-react';

interface CategoryIconProps {
  iconKey: string;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ iconKey, className = 'w-5 h-5' }) => {
  switch (iconKey) {
    case 'leaf':
      return <Leaf className={className} />;
    case 'apple':
      return <Apple className={className} />;
    case 'milk':
      return <Milk className={className} />;
    case 'beef':
      return <Beef className={className} />;
    case 'cup':
      return <CupSoda className={className} />;
    case 'croissant':
      return <Croissant className={className} />;
    case 'cake':
      return <CakeSlice className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'heart':
      return <HeartHandshake className={className} />;
    case 'snowflake':
      return <Snowflake className={className} />;
    case 'basket':
    default:
      return <ShoppingBasket className={className} />;
  }
};
