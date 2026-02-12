import React, { useState, useCallback, useRef, useEffect } from 'react';

export const useToast = () => {
  const [toast, setToast] = useState({ message: '', isVisible: false });
  const timerRef = useRef(null);

  const showToast = useCallback((message) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast({ message, isVisible: true });
    timerRef.current = window.setTimeout(() => {
      setToast({ message: '', isVisible: false });
      timerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (!timerRef.current) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  const ToastComponent = () => (
    toast.isVisible ? <div id="prism-toast" className="is-visible">{toast.message}</div> : null
  );

  return { toast, ToastComponent, showToast };
};
