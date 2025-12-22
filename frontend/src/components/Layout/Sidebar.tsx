import { NavLink } from 'react-router-dom';
import './Sidebar.css';
import uploadPng from '../../assets/image-upload.png';
import historyPng from '../../assets/document.png';
import logoPng from '../../assets/lens.png';

const navItems = [
    { to: '/', label: 'Upload', icon: uploadPng },
    { to: '/history', label: 'History', icon: historyPng },
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
                    <span className="logo-icon">
                        <img src={logoPng} alt="Inspectra Logo" className="custom-icon" />
                    </span>
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
                        <span className="nav-icon">
                            <img src={item.icon} alt={item.label} className="custom-icon" />
                        </span>
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
