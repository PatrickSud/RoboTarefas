import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, DollarSign, CheckCircle, BarChart2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

const COLORS = ['#818cf8','#34d399','#fb923c','#f472b6','#60a5fa','#a78bfa','#facc15'];

function parseBalance(val) {
  const n = parseFloat(String(val ?? '0').replace(/[^\d,./]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export default function Financeiro() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('account_run_results')
        .select('account_name, balance, platform, tasks_completed, status, executed_at')
        .gte('executed_at', since.toISOString())
        .order('executed_at', { ascending: true });
      if (data) setAllData(data);
      setLoading(false);
    }
    load();
  }, []);

  const successData = useMemo(() => allData.filter(r => r.status === 'success'), [allData]);

  // Gráfico de linha: saldo por data por conta
  const { lineData, accounts } = useMemo(() => {
    const accs = [...new Set(successData.map(r => r.account_name))];
    const byDate = {};
    for (const r of successData) {
      const date = new Date(r.executed_at).toLocaleDateString('pt-BR');
      if (!byDate[date]) byDate[date] = { date };
      const val = parseBalance(r.balance);
      if (val > 0) byDate[date][r.account_name] = val;
    }
    return { lineData: Object.values(byDate), accounts: accs };
  }, [successData]);

  // Último saldo por conta (cards de resumo)
  const latestByAccount = useMemo(() => {
    const map = {};
    for (const r of successData) {
      if (!map[r.account_name] || new Date(r.executed_at) > new Date(map[r.account_name].executed_at))
        map[r.account_name] = r;
    }
    return Object.values(map);
  }, [successData]);

  const totalSaldo = useMemo(
    () => latestByAccount.reduce((s, r) => s + parseBalance(r.balance), 0),
    [latestByAccount]
  );

  // Resumo por plataforma
  const byPlatform = useMemo(() => {
    const map = {};
    for (const r of successData) {
      const p = r.platform || 'Desconhecida';
      if (!map[p]) map[p] = { platform: p, tarefas: 0, execucoes: 0 };
      map[p].tarefas += Number(r.tasks_completed ?? 0);
      map[p].execucoes += 1;
    }
    return Object.values(map);
  }, [successData]);

  // Taxa de sucesso por conta
  const successRateByAccount = useMemo(() => {
    const map = {};
    for (const r of allData) {
      const n = r.account_name;
      if (!map[n]) map[n] = { name: n, total: 0, success: 0 };
      map[n].total += 1;
      if (r.status === 'success') map[n].success += 1;
    }
    return Object.values(map).map(r => ({ ...r, taxa: Math.round((r.success / r.total) * 100) }));
  }, [allData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Financeiro</h2>

      {/* Cards de saldo atual por conta */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-indigo-300 mb-1">Total consolidado</p>
          <p className="text-2xl font-bold text-white">R$ {totalSaldo.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">{latestByAccount.length} conta(s)</p>
        </div>
        {latestByAccount.map((r, i) => (
          <div key={r.account_name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 truncate mb-1">{r.account_name}</p>
            <p className="text-xl font-bold text-white">{r.balance || '—'}</p>
            <p className="text-xs mt-1" style={{ color: COLORS[i % COLORS.length] }}>{r.platform}</p>
          </div>
        ))}
      </div>

      {/* Gráfico de linha: evolução de saldo */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-indigo-400" />
          <h3 className="font-semibold text-white">Saldo ao Longo do Tempo (últimos 30 dias)</h3>
        </div>
        {lineData.length === 0 ? (
          <p className="text-center text-gray-600 text-sm py-8">Nenhum dado disponível.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              {accounts.map((acc, i) => (
                <Line key={acc} type="monotone" dataKey={acc} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tarefas por plataforma */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-orange-400" />
            <h3 className="font-semibold text-white">Tarefas por Plataforma</h3>
          </div>
          {byPlatform.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-8">Sem dados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byPlatform} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="platform" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} labelStyle={{ color: '#e5e7eb' }} itemStyle={{ color: '#e5e7eb' }} />
                <Bar dataKey="tarefas" name="Tarefas" radius={[4,4,0,0]}>
                  {byPlatform.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Taxa de sucesso por conta */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={16} className="text-green-400" />
            <h3 className="font-semibold text-white">Taxa de Sucesso por Conta</h3>
          </div>
          <div className="flex flex-col gap-3">
            {successRateByAccount.map((r, i) => (
              <div key={r.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 truncate">{r.name}</span>
                  <span className="text-gray-500">{r.success}/{r.total} ({r.taxa}%)</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${r.taxa}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  />
                </div>
              </div>
            ))}
            {successRateByAccount.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Sem dados.</p>}
          </div>
        </div>
      </div>

      {/* Resumo por plataforma - tabela */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mt-6">
        <div className="px-4 md:px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <DollarSign size={16} className="text-yellow-400" />
          <h3 className="font-semibold text-white">Resumo por Plataforma (30 dias)</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50 text-left">
            <tr>
              <th className="px-5 py-3 font-medium text-gray-400">Plataforma</th>
              <th className="px-5 py-3 font-medium text-gray-400">Execuções</th>
              <th className="px-5 py-3 font-medium text-gray-400">Tarefas totais</th>
              <th className="px-5 py-3 font-medium text-gray-400">Média tarefas/exec</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {byPlatform.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-600 text-sm">Sem dados.</td></tr>
            ) : byPlatform.map((p, i) => (
              <tr key={p.platform} className="hover:bg-gray-800/40">
                <td className="px-5 py-3 font-medium" style={{ color: COLORS[i % COLORS.length] }}>{p.platform}</td>
                <td className="px-5 py-3 text-gray-400">{p.execucoes}</td>
                <td className="px-5 py-3 text-gray-400">{p.tarefas}</td>
                <td className="px-5 py-3 text-gray-400">{p.execucoes > 0 ? (p.tarefas / p.execucoes).toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
