// @ts-nocheck
import { useState, useEffect, ComponentType } from 'react';
import { HotkeyVerificationModal } from './HotkeyVerificationModal';

interface WithHotkeyProtectionOptions {
  pageName: string;
  requireUniqueCode?: boolean;
  bypassForUsers?: boolean; // Allow regular users to bypass if they have a valid session
}

export function withHotkeyProtection<P extends object>(
  Component: ComponentType<P>,
  options: WithHotkeyProtectionOptions
) {
  return function ProtectedComponent(props: P & { serverUrl: string; accessToken?: string }) {
    const [isVerified, setIsVerified] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const { serverUrl, accessToken } = props;

    useEffect(() => {
      // Check if already verified in this session
      const sessionVerified = sessionStorage.getItem(`verified_${options.pageName}`);
      
      // If bypassing for users and user has valid session
      if (options.bypassForUsers && accessToken) {
        setIsVerified(true);
        return;
      }

      if (sessionVerified === 'true') {
        setIsVerified(true);
      } else {
        // Show verification modal after a short delay
        const timer = setTimeout(() => {
          setShowModal(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [accessToken]);

    const handleVerified = () => {
      setIsVerified(true);
      setShowModal(false);
      sessionStorage.setItem(`verified_${options.pageName}`, 'true');
    };

    const handleCancel = () => {
      // Redirect to landing page or previous page
      window.location.href = '/';
    };

    if (!isVerified) {
      return (
        <HotkeyVerificationModal
          isOpen={showModal}
          onVerified={handleVerified}
          onCancel={handleCancel}
          pageName={options.pageName}
          serverUrl={serverUrl}
          accessToken={accessToken}
          requireUniqueCode={options.requireUniqueCode}
        />
      );
    }

    return <Component {...props} />;
  };
}
