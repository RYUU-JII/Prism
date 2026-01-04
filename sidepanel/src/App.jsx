import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import Viewer from './components/Viewer.jsx';
import Footer from './components/Footer.jsx';
import ExpertEditor from './components/ExpertEditor.jsx';
import { performCaptureInParent } from './utils/capture';
import { useToast } from './hooks/useToast.jsx';

function App() {
  const [latestPayload, setLatestPayload] = useState(null);
  const [expertMode, setExpertMode] = useState(false);
  const [expertTheme, setExpertTheme] = useState('dark');
  const [pickerActive, setPickerActive] = useState(false);
  const viewerRef = useRef(null);
  const { ToastComponent, showToast } = useToast();

  useEffect(() => {
    // Apply theme to body
    document.body.dataset.theme = expertTheme;
  }, [expertTheme]);

  useEffect(() => {
    const handleMessages = (message) => {
      if (message.type === "PRISM_RENDER") {
        setLatestPayload(message);
      } else if (message.type === "PRISM_EXPORT_FOR_CAPTURE") {
        performCaptureInParent(message, latestPayload, showToast);
      } else if (message.type === "PRISM_PICKER_SELECT") {
        setPickerActive(false);
        // Additional logic to focus editor would go here
      }
    };

    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(handleMessages);

      chrome.runtime.sendMessage({ type: "PRISM_GET_LATEST" }, (resp) => {
        if (resp?.payload) {
          setLatestPayload(resp.payload);
        }
      });

      return () => {
        chrome.runtime.onMessage.removeListener(handleMessages);
      };
    }
  }, [latestPayload, showToast]);

  const handleSnapshot = (action = 'download') => {
    if (viewerRef.current) {
      viewerRef.current.contentWindow.postMessage({ type: "PRISM_SNAPSHOT", action }, "*");
    }
  };

  const handleSaveHtml = () => {
    if (!latestPayload?.code) return;
    const blob = new Blob([latestPayload.code], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: "prism-export.html",
      saveAs: true,
    }, () => URL.revokeObjectURL(url));
  };

  const handleThemeToggle = () => {
    const newTheme = expertTheme === 'dark' ? 'light' : 'dark';
    setExpertTheme(newTheme);
    localStorage.setItem('prism-expert-theme', newTheme);
  };

  const handleCodeUpdate = (newCode) => {
    if (latestPayload) {
      setLatestPayload(prev => ({ ...prev, code: newCode }));
    }
  };

  return (
    <div className={`panel-shell ${expertMode ? '' : 'prism-no-expert'}`}>
      <ToastComponent />
      <Header
        onSaveHtml={handleSaveHtml}
        onSnapshot={() => handleSnapshot('download')}
        onCopy={() => handleSnapshot('clipboard')}
      />
      <Viewer ref={viewerRef} payload={latestPayload} />
      {expertMode && (
        <ExpertEditor
          code={latestPayload?.code || ''}
          onCodeUpdate={handleCodeUpdate}
          theme={expertTheme}
        />
      )}
      <Footer
        expertMode={expertMode}
        onExpertModeToggle={() => setExpertMode(!expertMode)}
        expertTheme={expertTheme}
        onExpertThemeToggle={handleThemeToggle}
        pickerActive={pickerActive}
        onPickerToggle={() => setPickerActive(!pickerActive)}
        isPickerDisabled={latestPayload?.language !== 'html'}
      />
    </div>
  );
}

export default App;
