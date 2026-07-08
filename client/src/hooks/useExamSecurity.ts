import { useEffect, useState, useCallback } from 'react';

interface SecurityConfig {
  isEnabled: boolean;
  onViolation: (eventType: string, detail: string) => void;
}

export function useExamSecurity({ isEnabled, onViolation }: SecurityConfig) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenViolationCount, setFullscreenViolationCount] = useState(0);
  const [blurViolationCount, setBlurViolationCount] = useState(0);

  // Trigger browser fullscreen
  const requestFullscreen = useCallback(async () => {
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).mozRequestFullScreen) { /* Firefox */
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).webkitRequestFullscreen) { /* Chrome, Safari and Opera */
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) { /* IE/Edge */
        await (element as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err: any) {
      console.error('Failed to enter fullscreen:', err.message);
    }
  }, []);

  useEffect(() => {
    if (!isEnabled) return;

    // --- 1. FULLSCREEN TRACKER ---
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);

      if (!isCurrentlyFullscreen) {
        setFullscreenViolationCount((prev) => {
          const nextCount = prev + 1;
          onViolation(
            'FULLSCREEN_EXIT',
            `Student exited fullscreen mode (Total violations: ${nextCount})`
          );
          return nextCount;
        });
      }
    };

    // --- 2. FOCUS & PAGE VISIBILITY TRACKER ---
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setBlurViolationCount((prev) => {
          const nextCount = prev + 1;
          onViolation(
            'TAB_BLUR',
            `Student navigated away or hidden from the screen (Total tab switches: ${nextCount})`
          );
          return nextCount;
        });
      }
    };

    const handleWindowBlur = () => {
      setBlurViolationCount((prev) => {
        const nextCount = prev + 1;
        onViolation(
          'TAB_BLUR',
          `Student focus lost: Clicked outside the browser window (Total: ${nextCount})`
        );
        return nextCount;
      });
    };

    // --- 3. KEYBOARD / CLIPBOARD PREVENTION ---
    const preventClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      onViolation(
        'CLIPBOARD_PASTE_ATTEMPT',
        `Attempted clipboard event blocked: [${e.type.toUpperCase()}]`
      );
    };

    // Bind event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    // Block keyboard hotkeys and copy/cut/paste
    window.addEventListener('copy', preventClipboard as any);
    window.addEventListener('cut', preventClipboard as any);
    window.addEventListener('paste', preventClipboard as any);

    // Clean up listeners on unmount
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);

      window.removeEventListener('copy', preventClipboard as any);
      window.removeEventListener('cut', preventClipboard as any);
      window.removeEventListener('paste', preventClipboard as any);
    };
  }, [isEnabled, onViolation]);

  return {
    isFullscreen,
    fullscreenViolationCount,
    blurViolationCount,
    requestFullscreen,
  };
}
