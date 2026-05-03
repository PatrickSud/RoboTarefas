import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp } from 'lucide-react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
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
    // Usa todos os registros com balance não-nulo (sucesso ou não)
    const withBalance = allData.filter(r => r.balance !== null && r.balance !== undefined);
    const accs = [...new Set(withBalance.map(r => r.account_name))];
    const byDate = {};
    for (const r of withBalance) {
      const date = new Date(r.executed_at).toLocaleDateString('pt-BR');
      if (!byDate[date]) byDate[date] = { date };
      const val = parseBalance(r.balance);
      // Atribui mesmo se val === 0 para manter a linha visível
      byDate[date][r.account_name] = val;
    }
    return { lineData: Object.values(byDate), accounts: accs };
  }, [allData]);

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
                <Line
                  key={acc}
                  type="monotone"
                  dataKey={(row) => row[acc] ?? null}
                  name={acc}
                  stroke={COLORS[i % COLORS.length]}
                  dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
                  strokeWidth={2}
                  connectNulls={true}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
