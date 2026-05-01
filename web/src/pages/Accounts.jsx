import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, ToggleLeft, ToggleRight, Pencil, Trash2, GripVertical, FlaskConical } from 'lucide-react';
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

function SortableRow({ account, onToggleActive, onToggleTestMode, onEdit, onDelete }) {
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
          <button onClick={() => onDelete(account)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400">
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor));

  async function fetchAccounts() {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (!error && data) setAccounts(data);
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
    if (!error)
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, active: !a.active } : a));
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
    if (!error) setAccounts(prev => prev.filter(a => a.id !== account.id));
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-bold text-white">Contas</h2>
        <button
          onClick={() => { setEditingAccount(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Nova Conta
        </button>
      </div>

      {showForm && (
        <AccountForm
          account={editingAccount}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchAccounts(); }}
        />
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-800/50 text-left">
              <tr>
                <th className="px-3 py-3 w-8"></th>
                <th className="px-4 py-3 font-medium text-gray-400">Nome</th>
                <th className="px-4 py-3 font-medium text-gray-400">Plataforma</th>
                <th className="px-4 py-3 font-medium text-gray-400">Telefone</th>
                <th className="px-4 py-3 font-medium text-gray-400" title="Modo Teste">Teste</th>
                <th className="px-4 py-3 font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-right">Ações</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={accounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-gray-800">
                  {accounts.map(account => (
                    <SortableRow
                      key={account.id}
                      account={account}
                      onToggleActive={toggleActive}
                      onToggleTestMode={toggleTestMode}
                      onEdit={(a) => { setEditingAccount(a); setShowForm(true); }}
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

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
      <h3 className="font-semibold text-white mb-4">
        {account ? 'Editar Conta' : 'Nova Conta'}
      </h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nome" name="name" value={form.name} onChange={handleChange} required />
        <Input label="Plataforma" name="platform" value={form.platform} onChange={handleChange} required />
        <Input label="Telefone" name="phone" value={form.phone} onChange={handleChange} required />
        <Input label="WhatsApp" name="whatsapp_phone" value={form.whatsapp_phone} onChange={handleChange} />
        <Input label="E-mail" name="email" type="email" value={form.email} onChange={handleChange} />
        <Input label="Senha da Plataforma" name="password" value={form.password} onChange={handleChange} required />

        <div className="sm:col-span-2 flex items-center gap-6 flex-wrap">
          <Checkbox label="Ativo" name="active" checked={form.active} onChange={handleChange} />
          <Checkbox label="Recebe WhatsApp" name="receives_whatsapp" checked={form.receives_whatsapp} onChange={handleChange} />
          <Checkbox label="Modo Teste" name="test_mode" checked={form.test_mode} onChange={handleChange} />
        </div>

        <div className="sm:col-span-2 flex items-center gap-3 pt-2">
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
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
      <input
        {...props}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-600"
      />
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
