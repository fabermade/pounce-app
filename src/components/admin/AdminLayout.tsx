import React from 'react';
import { LayoutDashboard, Users, Settings, BarChart3, FileText } from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
  currentPath: string;
  currentUser?: { name: string | null; email: string } | null;
}

const navItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/leads', label: 'Leads', icon: Users },
  { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/forms', label: 'Forms', icon: FileText },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children, currentPath, currentUser }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-cream flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <a href="/admin" className="flex items-center gap-2">
            <span className="text-2xl font-bold font-heading">
              <span className="text-pounce-orange">P</span>
              <span className="text-charcoal">ounce</span>
            </span>
          </a>
          <p className="text-xs text-gray-500 mt-1">Lead Response Dashboard</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPath === item.path;
            return (
              <a
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-pounce-orange/10 text-pounce-orange'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-charcoal'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-charcoal flex items-center justify-center text-white text-sm font-medium">
              {(currentUser?.name?.[0] || currentUser?.email?.[0] || 'A').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-charcoal truncate">{currentUser?.name || 'Admin'}</p>
              <p className="text-xs text-gray-500 truncate">{currentUser?.email || ''}</p>
            </div>
          </div>
          <a
            href="/api/admin/logout"
            className="mt-3 block text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Log out
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  );
}
