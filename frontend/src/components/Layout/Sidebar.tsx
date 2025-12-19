import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const navItems = [
    { to: '/', label: 'Upload', icon: '📤' },
    { to: '/history', label: 'History', icon: '📋' },
];

interface SidebarProps {
    isOpen?: boolean;
    onNavClick?: () => void;
}

export function Sidebar({ isOpen = true, onNavClick }: SidebarProps) {
    return (
        <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <span className="logo-icon">🔍</span>
                    <span className="logo-text">InspectraCXR</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        onClick={onNavClick}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-version">
                    <span className="version-badge">v4.5.0</span>
                </div>
            </div>
        </aside>
    );
}
