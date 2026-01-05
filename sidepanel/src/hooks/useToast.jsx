import React, { useState, useCallback } from 'react';

export const useToast = () => {
  const [toast, setToast] = useState({ message: '', isVisible: false });

  const showToast = useCallback((message) => {
    setToast({ message, isVisible: true });
    setTimeout(() => {
      setToast({ message: '', isVisible: false });
    }, 2200);
  }, []);

  const ToastComponent = () => (
    toast.isVisible ? <div id="prism-toast" className="is-visible">{toast.message}</div> : null
  );

  return { ToastComponent, showToast };
};
