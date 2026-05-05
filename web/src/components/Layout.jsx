import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, Users, History, DollarSign, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';

const sidebarLinkClass = ({ isActive }) =>
  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-500/20 text-indigo-400'
      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
  }`;

const bottomNavLinkClass = ({ isActive }) =>
  `flex flex-col items-center justify-center gap-1 flex-1 py-2 text-xs font-medium transition-colors ${
    isActive ? 'text-indigo-400' : 'text-gray-500'
  }`;

export default function Layout() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 p-4 flex-col shrink-0">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">RoboTarefas</h1>
          <p className="text-xs text-gray-500">Painel de Controle</p>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <NavLink to="/" className={sidebarLinkClass}>
            <LayoutDashboard size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/accounts" className={sidebarLinkClass}>
            <Users size={18} />
            Contas
          </NavLink>
          <NavLink to="/financeiro" className={sidebarLinkClass}>
            <DollarSign size={18} />
            Financeiro
          </NavLink>
          <NavLink to="/saldos" className={sidebarLinkClass}>
            <Wallet size={18} />
            Saldos
          </NavLink>
          <NavLink to="/history" className={sidebarLinkClass}>
            <History size={18} />
            Histórico
          </NavLink>
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors mt-auto"
        >
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile — só título */}
        <header className="md:hidden flex items-center justify-center px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
          <span className="text-white font-bold text-sm">RoboTarefas</span>
        </header>

        {/* pb-20 garante que o conteúdo não fique atrás da bottom nav */}
        <main className="flex-1 p-4 md:p-8 bg-gray-950 pb-20 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Bottom Navigation Bar — apenas mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800 flex items-stretch">
        <NavLink to="/" className={bottomNavLinkClass} end>
          <LayoutDashboard size={20} />
          Dashboard
        </NavLink>
        <NavLink to="/accounts" className={bottomNavLinkClass}>
          <Users size={20} />
          Contas
        </NavLink>
        <NavLink to="/financeiro" className={bottomNavLinkClass}>
          <DollarSign size={20} />
          Financeiro
        </NavLink>
        <NavLink to="/saldos" className={bottomNavLinkClass}>
          <Wallet size={20} />
          Saldos
        </NavLink>
        <NavLink to="/history" className={bottomNavLinkClass}>
          <History size={20} />
          Histórico
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-red-400"
        >
          <LogOut size={20} />
          Sair
        </button>
      </nav>
    </div>
  );
}
