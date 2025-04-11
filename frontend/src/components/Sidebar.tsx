import React from 'react';

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors rounded-lg"
    >
      <div className="mr-3">{icon}</div>
      <span>{label}</span>
    </button>
  );
};

interface ProfileProps {
  name: string;
  email: string;
  avatarUrl: string;
}

const Profile: React.FC<ProfileProps> = ({ name, email, avatarUrl }) => {
  return (
    <div className="flex items-center px-4 py-3">
      <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full mr-3" />
      <div className="text-sm">
        <p className="text-gray-300 font-medium">{name}</p>
        <p className="text-gray-500 text-xs">{email}</p>
      </div>
    </div>
  );
};

const Logo: React.FC = () => {
  return (
    <div className="flex items-center px-4 py-6">
      {/* <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-2">
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4L4 8L12 12L20 8L12 4Z" fill="currentColor" />
          <path d="M4 12L12 16L20 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div> */}
      <div>
        <span className="text-white text-lg font-semibold">inspectra</span>
        <span className="text-blue-400 text-lg font-semibold">CXR</span>
      </div>
    </div>
  );
};

// Icons
const UploadIcon: React.FC = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const HistoryIcon: React.FC = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ConsultIcon: React.FC = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

interface SidebarProps {
  onUpload?: () => void;
  onHistory?: () => void;
  onConsult?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onUpload,
  onHistory,
  onConsult,
}) => {
  return (
    <div className="flex flex-col justify-between h-screen bg-gray-900 w-64">
      <div>
        <Logo />
        <div className="mt-6 px-2">
          <SidebarItem icon={<UploadIcon />} label="Upload" onClick={onUpload} />
          <SidebarItem icon={<HistoryIcon />} label="History" onClick={onHistory} />
          <SidebarItem icon={<ConsultIcon />} label="Consult CXR" onClick={onConsult} />
        </div>
      </div>
      <div className="mb-4">
        <Profile
          name="Perceptra"
          email="perceptra@perceptra.tech"
          avatarUrl="https://avatar.iran.liara.run/public/26"
        />
      </div>
    </div>
  );
};

export default Sidebar;