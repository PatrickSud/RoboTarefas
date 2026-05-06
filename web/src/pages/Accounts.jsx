import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, ToggleLeft, ToggleRight, Pencil, Trash2, GripVertical, FlaskConical, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, Copy, Download, Upload } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableRow({ account, onToggleActive, onToggleTestMode, onEdit, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-gray-800/40 ${isDragging ? 'bg-gray-800' : ''}`}
    >
      <td className="px-3 py-3 text-gray-600 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </td>
      <td className="px-4 py-3 font-medium text-gray-100">{account.name}</td>
      <td className="px-4 py-3 text-gray-400">{account.platform}</td>
      <td className="px-4 py-3 text-gray-400">{account.phone}</td>
      <td className="px-4 py-3">
        <button onClick={() => onToggleTestMode(account)} title={account.test_mode ? 'Desativar modo teste' : 'Ativar modo teste'}>
          {account.test_mode ? (
            <FlaskConical size={20} className="text-amber-400" />
          ) : (
            <FlaskConical size={20} className="text-gray-600" />
          )}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-48">
          {(account.schedules || []).length > 0 ? (
            [...account.schedules].sort((a, b) => a - b).map(hour => (
              <span key={hour} className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                {String(hour).padStart(2, '0')}:00
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-600">Sem horário</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <button onClick={() => onToggleActive(account)} title={account.active ? 'Desativar' : 'Ativar'}>
          {account.active ? (
            <ToggleRight size={24} className="text-green-500" />
          ) : (
            <ToggleLeft size={24} className="text-gray-600" />
          )}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => onEdit(account)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-200">
            <Pencil size={16} />
          </button>
          <button onClick={() => onDuplicate(account)} className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-gray-500 hover:text-indigo-300" title="Duplicar conta">
            <Copy size={16} />
          </button>
          <button onClick={() => onDelete(account)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400">
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SortableHeader({ label, colKey, sortConfig, onSort }) {
  const isActive = sortConfig.key === colKey;
  const Icon = isActive ? (sortConfig.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className="px-4 py-3 font-medium text-gray-400 cursor-pointer select-none hover:text-gray-200 transition-colors"
      onClick={() => onSort(colKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon size={14} className={isActive ? 'text-indigo-400' : 'text-gray-600'} />
      </div>
    </th>
  );
}

const FILTER_KEY = 'accounts_filters';

function loadFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; }
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const saved = loadFilters();
  const [searchBar, setSearchBar] = useState(saved.searchBar || '');
  const [sortConfig, setSortConfig] = useState(saved.sortConfig || { key: null, dir: 'asc' });

  function saveFilters(updates) {
    const current = loadFilters();
    localStorage.setItem(FILTER_KEY, JSON.stringify({ ...current, ...updates }));
  }

  function handleSort(key) {
    setSortConfig(prev => {
      const dir = prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc';
      const next = { key, dir };
      saveFilters({ sortConfig: next });
      return next;
    });
  }

  const displayAccounts = useMemo(() => {
    let list = accounts;
    if (searchBar) {
      const q = searchBar.toLowerCase();
      list = list.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.phone?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q)
      );
    }
    if (sortConfig.key) {
      list = [...list].sort((a, b) => {
        const va = (a[sortConfig.key] || '').toLowerCase();
        const vb = (b[sortConfig.key] || '').toLowerCase();
        return sortConfig.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [accounts, searchBar, sortConfig]);

  const sensors = useSensors(useSensor(PointerSensor));

  async function syncAwsSchedule(accountsList) {
    try {
      const hoursSet = new Set();
      for (const acc of accountsList) {
        if (acc.active && acc.schedules && Array.isArray(acc.schedules)) {
          acc.schedules.forEach(h => hoursSet.add(h));
        }
      }
      const uniqueHours = Array.from(hoursSet).sort((a, b) => a - b);
      
      const response = await fetch('/api/run-robot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-schedule', hours: uniqueHours }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        alert(
          `Conta salva, mas o agendamento da AWS não foi atualizado: ${
            payload.message || response.statusText
          }`
        );
      }
    } catch (e) {
      console.error('Erro ao sincronizar agendamento AWS:', e);
      alert(`Conta salva, mas o agendamento da AWS não foi atualizado: ${e.message}`);
    }
  }

  async function fetchAccounts() {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (!error && data) {
      setAccounts(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function toggleActive(account) {
    const { error } = await supabase
      .from('accounts')
      .update({ active: !account.active, updated_at: new Date().toISOString() })
      .eq('id', account.id);
    if (!error) {
      setAccounts(prev => {
        const next = prev.map(a => a.id === account.id ? { ...a, active: !a.active } : a);
        syncAwsSchedule(next);
        return next;
      });
    }
  }

  async function toggleTestMode(account) {
    const { error } = await supabase
      .from('accounts')
      .update({ test_mode: !account.test_mode, updated_at: new Date().toISOString() })
      .eq('id', account.id);
    if (!error)
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, test_mode: !a.test_mode } : a));
  }

  async function deleteAccount(account) {
    if (!confirm(`Tem certeza que deseja excluir "${account.name}"?`)) return;
    const { error } = await supabase.from('accounts').delete().eq('id', account.id);
    if (!error) {
      setAccounts(prev => {
        const next = prev.filter(a => a.id !== account.id);
        syncAwsSchedule(next);
        return next;
      });
    }
  }

  async function duplicateAccount(account) {
    const copyName = `${account.name} (cópia)`;
    const payload = {
      ...account,
      id: undefined,
      name: copyName,
      active: false,
      test_mode: false,
      local_key: `${account.platform}:${account.phone}:${copyName}:${Date.now()}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9:.-]/g, '-'),
      sort_order: accounts.length + 1,
      created_at: undefined,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('accounts').insert(payload).select('*').single();
    if (error) {
      alert('Erro ao duplicar conta: ' + error.message);
      return;
    }

    setAccounts(prev => [...prev, data]);
    setEditingAccount(data);
    setShowForm(true);
  }

  async function exportBackup() {
    const [{ data: accountsData, error: accountsError }, { data: settingsData, error: settingsError }] = await Promise.all([
      supabase.from('accounts').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      supabase.from('global_settings').select('*'),
    ]);

    if (accountsError || settingsError) {
      alert(`Erro ao exportar backup: ${accountsError?.message || settingsError?.message}`);
      return;
    }

    const backup = {
      exported_at: new Date().toISOString(),
      version: 1,
      accounts: accountsData || [],
      global_settings: settingsData || [],
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `robotarefas-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const backup = JSON.parse(content);
      const accountsBackup = Array.isArray(backup.accounts) ? backup.accounts : [];
      const settingsBackup = Array.isArray(backup.global_settings) ? backup.global_settings : [];

      if (accountsBackup.length === 0 && settingsBackup.length === 0) {
        alert('Arquivo de backup inválido ou vazio.');
        return;
      }

      if (!confirm(`Importar ${accountsBackup.length} conta(s) e ${settingsBackup.length} configuração(ões)? Os registros existentes com o mesmo ID serão atualizados.`)) {
        return;
      }

      const now = new Date().toISOString();
      const sanitizedAccounts = accountsBackup.map(account => ({
        ...account,
        updated_at: now,
      }));
      const sanitizedSettings = settingsBackup.map(setting => ({
        ...setting,
        updated_at: now,
      }));

      if (sanitizedAccounts.length > 0) {
        const { error } = await supabase.from('accounts').upsert(sanitizedAccounts, { onConflict: 'id' });
        if (error) throw error;
      }

      if (sanitizedSettings.length > 0) {
        const { error } = await supabase.from('global_settings').upsert(sanitizedSettings, { onConflict: 'key' });
        if (error) throw error;
      }

      await fetchAccounts();
      syncAwsSchedule(sanitizedAccounts);
      alert('Backup importado com sucesso.');
    } catch (error) {
      alert('Erro ao importar backup: ' + error.message);
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accounts.findIndex(a => a.id === active.id);
    const newIndex = accounts.findIndex(a => a.id === over.id);
    const reordered = arrayMove(accounts, oldIndex, newIndex);
    setAccounts(reordered);
    const updates = reordered.map((a, i) =>
      supabase.from('accounts').update({ sort_order: i + 1 }).eq('id', a.id)
    );
    await Promise.all(updates);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-white">Contas</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={exportBackup}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download size={16} />
            Exportar
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
            <Upload size={16} />
            Importar
            <input type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
          </label>
        </div>
      </div>

      {/* Search Bar global */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou plataforma..."
            value={searchBar}
            onChange={e => { setSearchBar(e.target.value); saveFilters({ searchBar: e.target.value }); }}
            className="w-full pl-9 pr-9 py-2 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
          />
          {searchBar && (
            <button onClick={() => { setSearchBar(''); saveFilters({ searchBar: '' }); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => { setEditingAccount(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nova Conta</span>
          <span className="sm:hidden">Nova</span>
        </button>
      </div>

      {showForm && (
        <AccountForm
          account={editingAccount}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            const { data } = await supabase.from('accounts').select('*');
            if (data) {
              setAccounts(data);
              syncAwsSchedule(data);
            } else {
              fetchAccounts();
            }
          }}
        />
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-800/50 text-left">
              <tr>
                <th className="px-3 py-3 w-8"></th>
                <SortableHeader label="Nome" colKey="name" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Plataforma" colKey="platform" sortConfig={sortConfig} onSort={handleSort} />
                <SortableHeader label="Telefone" colKey="phone" sortConfig={sortConfig} onSort={handleSort} />
                <th className="px-4 py-3 font-medium text-gray-400" title="Modo Teste">Teste</th>
                <th className="px-4 py-3 font-medium text-gray-400">Horários</th>
                <th className="px-4 py-3 font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-right">Ações</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayAccounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-gray-800">
                  {displayAccounts.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-600 text-sm">Nenhuma conta encontrada.</td></tr>
                  ) : displayAccounts.map(account => (
                    <SortableRow
                      key={account.id}
                      account={account}
                      onToggleActive={toggleActive}
                      onToggleTestMode={toggleTestMode}
                      onEdit={(a) => { setEditingAccount(a); setShowForm(true); }}
                      onDuplicate={duplicateAccount}
                      onDelete={deleteAccount}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      </div>
    </div>
  );
}

function AccountForm({ account, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: account?.name || '',
    phone: account?.phone || '',
    password: account?.password || '',
    platform: account?.platform || '',
    whatsapp_phone: account?.whatsapp_phone || '',
    email: account?.email || '',
    receives_whatsapp: account?.receives_whatsapp ?? true,
    active: account?.active ?? true,
    test_mode: account?.test_mode ?? false,
    schedules: account?.schedules || [],
  });
  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      ...form,
      local_key: `${form.platform}:${form.phone}:${form.name}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9:.-]/g, '-'),
      updated_at: new Date().toISOString(),
    };

    let error;
    if (account) {
      ({ error } = await supabase.from('accounts').update(payload).eq('id', account.id));
    } else {
      ({ error } = await supabase.from('accounts').insert(payload));
    }

    setSaving(false);
    if (!error) onSaved();
    else alert('Erro ao salvar: ' + error.message);
  }

  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  function toggleSchedule(hour) {
    setForm(prev => {
      const current = prev.schedules || [];
      if (current.includes(hour)) {
        return { ...prev, schedules: current.filter(h => h !== hour) };
      }
      return { ...prev, schedules: [...current, hour].sort((a, b) => a - b) };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
          <X size={20} />
        </button>
        <h3 className="font-semibold text-white mb-4">
          {account ? 'Editar Conta' : 'Nova Conta'}
        </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nome" name="name" value={form.name} onChange={handleChange} required />
        <Input label="Plataforma" name="platform" value={form.platform} onChange={handleChange} required />
        <Input label="Telefone" name="phone" value={form.phone} onChange={handleChange} required copyable />
        <Input label="WhatsApp" name="whatsapp_phone" value={form.whatsapp_phone} onChange={handleChange} copyable />
        <Input label="E-mail" name="email" type="email" value={form.email} onChange={handleChange} />
        <Input label="Senha da Plataforma" name="password" value={form.password} onChange={handleChange} required copyable />

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-400 mb-2">Agendamentos (Horários de Brasília)</label>
          <div className="flex flex-wrap gap-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            {HOURS.map(h => {
              const active = (form.schedules || []).includes(h);
              return (
                <button
                  type="button"
                  key={h}
                  onClick={() => toggleSchedule(h)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    active ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50' : 'bg-gray-800 text-gray-500 border-gray-600 hover:bg-gray-700 hover:text-gray-300'
                  }`}
                >
                  {String(h).padStart(2, '0')}:00
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-1">A AWS vai ligar a máquina e rodar esta conta especificamente nestes horários.</p>
        </div>

        <div className="sm:col-span-2 flex items-center gap-6 flex-wrap mt-2">
          <Checkbox label="Ativo" name="active" checked={form.active} onChange={handleChange} />
          <Checkbox label="Recebe WhatsApp" name="receives_whatsapp" checked={form.receives_whatsapp} onChange={handleChange} />
          <Checkbox label="Modo Teste" name="test_mode" checked={form.test_mode} onChange={handleChange} />
        </div>

        <div className="sm:col-span-2 flex items-center gap-3 pt-4 border-t border-gray-800 mt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-100 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

function Input({ label, copyable, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          {...props}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-600"
        />
        {copyable && props.value && (
          <button 
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(props.value);
            }}
            className="p-2 bg-gray-800 border border-gray-700 text-gray-400 rounded-lg hover:text-white hover:bg-gray-700 transition-colors shrink-0"
            title="Copiar"
          >
            <Copy size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function Checkbox({ label, ...props }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" {...props} className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500" />
      {label}
    </label>
  );
}
