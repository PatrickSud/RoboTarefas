import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, History, Menu, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-500/20 text-indigo-400'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
  }`;

function SidebarContent({ onClose, onLogout }) {
  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">RoboTarefas</h1>
          <p className="text-xs text-gray-500">Painel de Controle</p>
        </div>
        <button className="md:hidden text-gray-400 hover:text-white" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <NavLink to="/" className={navLinkClass} onClick={onClose}>
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>
        <NavLink to="/accounts" className={navLinkClass} onClick={onClose}>
          <Users size={18} />
          Contas
        </NavLink>
        <NavLink to="/history" className={navLinkClass} onClick={onClose}>
          <History size={18} />
          Histórico
        </NavLink>
      </nav>

      <button
        onClick={onLogout}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors mt-auto"
      >
        <LogOut size={18} />
        Sair
      </button>
    </>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 p-4 flex-col shrink-0">
        <SidebarContent onClose={() => {}} onLogout={handleLogout} />
      </aside>

      {/* Drawer mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-50 w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
            <SidebarContent onClose={() => setSidebarOpen(false)} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <Menu size={22} />
          </button>
          <span className="text-white font-bold text-sm">RoboTarefas</span>
          <div className="w-6" />
        </header>

        <main className="flex-1 p-4 md:p-8 bg-gray-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
