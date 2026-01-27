import type { ReactNode } from 'react';
import { DragBar } from './DragBar';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SidebarResizer } from './SidebarResizer';
import { StatusBar } from './StatusBar';
import { SettingsModal } from './SettingsModal';
import { AboutModal } from './AboutModal';
import { UpdateNotification } from './UpdateNotification';
import { useUIStore } from '../../stores';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentView, sidebarWidth, sidebarCollapsed } = useUIStore();
  const showSidebar = currentView !== 'kanban';

  return (
    <div className="layout">
      <DragBar />
      <Header />
      <div className="layout-body">
        {showSidebar && (
          <>
            <div
              className={`sidebar-container ${sidebarCollapsed ? 'collapsed' : ''}`}
              style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
            >
              <Sidebar />
            </div>
            <SidebarResizer />
          </>
        )}
        <main className="layout-main">
          {children}
        </main>
      </div>
      <StatusBar />
      <SettingsModal />
      <AboutModal />
      <UpdateNotification />
    </div>
  );
}
