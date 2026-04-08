// @ts-nocheck
// ⚡⚡⚡ RESPONSIVE DESIGN HOOK ⚡⚡⚡
// Auto-detect device type and provide responsive utilities

import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface ResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: DeviceType;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
}

/**
 * Hook to detect device type and screen size
 * Auto-updates on window resize
 */
export const useResponsive = (): ResponsiveState => {
  const [state, setState] = useState<ResponsiveState>(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    return {
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      deviceType: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop',
      width,
      height,
      orientation: width > height ? 'landscape' : 'portrait'
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setState({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        deviceType: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop',
        width,
        height,
        orientation: width > height ? 'landscape' : 'portrait'
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return state;
};

/**
 * Check if device is touch-enabled
 */
export const isTouchDevice = (): boolean => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  );
};

/**
 * Get responsive class based on device
 */
export const getResponsiveClass = (
  mobileClass: string,
  tabletClass: string,
  desktopClass: string,
  deviceType: DeviceType
): string => {
  switch (deviceType) {
    case 'mobile':
      return mobileClass;
    case 'tablet':
      return tabletClass;
    case 'desktop':
      return desktopClass;
    default:
      return desktopClass;
  }
};

/**
 * Get responsive value based on device
 */
export const getResponsiveValue = <T,>(
  mobileValue: T,
  tabletValue: T,
  desktopValue: T,
  deviceType: DeviceType
): T => {
  switch (deviceType) {
    case 'mobile':
      return mobileValue;
    case 'tablet':
      return tabletValue;
    case 'desktop':
      return desktopValue;
    default:
      return desktopValue;
  }
};
