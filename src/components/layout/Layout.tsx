import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FileText, Kanban } from 'lucide-react';
import { DragBar } from './DragBar';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SidebarResizer } from './SidebarResizer';
import { StatusBar } from './StatusBar';
import { SettingsModal } from './SettingsModal';
import { AboutModal } from './AboutModal';
import { UpdateNotification } from './UpdateNotification';
import { useUIStore } from '../../stores';
import { isIOS, isMobile } from '../../utils/platform';
import { useCompactLayout } from '../../hooks/useCompactLayout';
import './Layout.css';

const EDGE_SWIPE_START_PX = 28;
const EDGE_SWIPE_ACTIVATE_PX = 12;
const EDGE_SWIPE_OPEN_PX = 72;

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentView, setView, sidebarWidth, sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const compact = useCompactLayout();
  const showSidebar = currentView !== 'kanban' || isIOS;
  const layoutBodyRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef(0);
  const swipeRef = useRef({
    tracking: false,
    active: false,
    startX: 0,
    startY: 0,
  });
  const [dragOffset, setDragOffset] = useState(0);
  const [isEdgeDragging, setIsEdgeDragging] = useState(false);

  useEffect(() => {
    if (!compact || !showSidebar) {
      return;
    }

    const layoutBody = layoutBodyRef.current;
    if (!layoutBody) return;

    const getSidebarWidth = () => (
      sidebarRef.current?.getBoundingClientRect().width
      || Math.min(window.innerWidth * 0.86, 360)
    );

    const setLiveDragOffset = (offset: number) => {
      dragOffsetRef.current = offset;
      setDragOffset(offset);
    };

    const resetGesture = () => {
      swipeRef.current = {
        tracking: false,
        active: false,
        startX: 0,
        startY: 0,
      };
      dragOffsetRef.current = 0;
      setDragOffset(0);
      setIsEdgeDragging(false);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (mobileSidebarOpen || event.touches.length !== 1) return;

      const touch = event.touches[0];
      if (touch.clientX > EDGE_SWIPE_START_PX) return;

      swipeRef.current = {
        tracking: true,
        active: false,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = swipeRef.current;
      if (!gesture.tracking || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absDeltaY = Math.abs(deltaY);

      if (deltaX < 0) {
        resetGesture();
        return;
      }

      if (!gesture.active) {
        if (absDeltaY > EDGE_SWIPE_ACTIVATE_PX && absDeltaY > deltaX) {
          resetGesture();
          return;
        }

        if (deltaX < EDGE_SWIPE_ACTIVATE_PX || deltaX <= absDeltaY) {
          return;
        }

        gesture.active = true;
        setIsEdgeDragging(true);
        // Dismiss the soft keyboard as soon as the edge-swipe is recognized
        // so the sidebar slides in over an unobstructed layout.
        const focused = document.activeElement as HTMLElement | null;
        focused?.blur?.();
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      setLiveDragOffset(Math.min(deltaX, getSidebarWidth()));
    };

    const handleTouchEnd = () => {
      const gesture = swipeRef.current;
      if (gesture.active && dragOffsetRef.current >= EDGE_SWIPE_OPEN_PX) {
        setMobileSidebarOpen(true);
      }
      resetGesture();
    };

    layoutBody.addEventListener('touchstart', handleTouchStart, { passive: true });
    layoutBody.addEventListener('touchmove', handleTouchMove, { passive: false });
    layoutBody.addEventListener('touchend', handleTouchEnd);
    layoutBody.addEventListener('touchcancel', resetGesture);

    return () => {
      layoutBody.removeEventListener('touchstart', handleTouchStart);
      layoutBody.removeEventListener('touchmove', handleTouchMove);
      layoutBody.removeEventListener('touchend', handleTouchEnd);
      layoutBody.removeEventListener('touchcancel', resetGesture);
      resetGesture();
    };
  }, [compact, mobileSidebarOpen, setMobileSidebarOpen, showSidebar]);

  const sidebarStyle: CSSProperties = {
    width: compact ? undefined : (sidebarCollapsed ? 0 : isMobile ? 'clamp(260px, 28vw, 320px)' : sidebarWidth),
  };

  if (compact && !mobileSidebarOpen && dragOffset > 0) {
    sidebarStyle.transform = `translateX(calc(-100% + ${dragOffset}px))`;
  }

  const backdropStyle: CSSProperties | undefined = isEdgeDragging
    ? { opacity: Math.min(dragOffset / EDGE_SWIPE_OPEN_PX, 1) }
    : undefined;

  const handleModeChange = (view: 'notes' | 'kanban') => {
    setView(view);
    setMobileSidebarOpen(false);
  };

  const modeSwitcher = isIOS && (
    <nav className={compact ? 'ios-mode-pill' : 'header-mode-switcher'} aria-label="View mode">
      <button
        className={`ios-mode-pill-btn ${currentView === 'notes' ? 'active' : ''}`}
        onClick={() => handleModeChange('notes')}
        aria-pressed={currentView === 'notes'}
      >
        <FileText size={17} />
        <span>Notes</span>
      </button>
      <button
        className={`ios-mode-pill-btn ${currentView === 'kanban' ? 'active' : ''}`}
        onClick={() => handleModeChange('kanban')}
        aria-pressed={currentView === 'kanban'}
      >
        <Kanban size={17} />
        <span>Board</span>
      </button>
    </nav>
  );

  return (
    <div className={`layout ${isIOS && compact ? 'ios-bottom-mode' : ''}`}>
      <DragBar />
      <Header compact={compact} viewSwitcher={!compact ? modeSwitcher : undefined} />
      <div className="layout-body" ref={layoutBodyRef}>
        {showSidebar && compact && (mobileSidebarOpen || isEdgeDragging) && (
          <button
            className={`sidebar-mobile-backdrop ${isEdgeDragging ? 'dragging' : ''}`}
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close notes"
            style={backdropStyle}
          />
        )}
        {showSidebar && (
          <>
            <div
              ref={sidebarRef}
              id="notes-sidebar"
              inert={compact ? !mobileSidebarOpen && !isEdgeDragging : sidebarCollapsed}
              className={`sidebar-container ${!compact && sidebarCollapsed ? 'collapsed' : ''} ${
                compact && mobileSidebarOpen ? 'mobile-open' : ''
              } ${isEdgeDragging ? 'mobile-dragging' : ''}`}
              style={sidebarStyle}
            >
              <Sidebar />
            </div>
            {!isMobile && !compact && <SidebarResizer />}
          </>
        )}
        <main className="layout-main">
          {children}
        </main>
      </div>
      {compact && modeSwitcher}
      <StatusBar />
      <SettingsModal />
      <AboutModal />
      <UpdateNotification />
    </div>
  );
}
