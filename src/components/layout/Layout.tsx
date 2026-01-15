import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { SettingsModal } from './SettingsModal';
import { AboutModal } from './AboutModal';
import { UpdateNotification } from './UpdateNotification';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <Header />
      <div className="layout-body">
        <Sidebar />
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
