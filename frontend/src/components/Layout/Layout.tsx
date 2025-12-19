import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import './Layout.css';

export function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth >= 768) {
                setIsSidebarOpen(false);
            }
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const toggleSidebar = () => {
        setIsSidebarOpen(prev => !prev);
    };

    const closeSidebar = () => {
        if (isMobile) {
            setIsSidebarOpen(false);
        }
    };

    return (
        <div className={`app-layout ${isMobile ? 'mobile' : ''}`}>
            {isMobile && (
                <button className="hamburger-btn" onClick={toggleSidebar} aria-label="Toggle menu">
                    <span className="hamburger-icon">{isSidebarOpen ? '✕' : '☰'}</span>
                </button>
            )}

            {isMobile && isSidebarOpen && (
                <div className="sidebar-overlay" onClick={closeSidebar} />
            )}

            <Sidebar isOpen={!isMobile || isSidebarOpen} onNavClick={closeSidebar} />

            <main className="app-content">
                <Outlet />
            </main>
        </div>
    );
}
