import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, ArrowDownCircle, Wallet } from 'lucide-react';
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

  // Detectar saques: balance diminuiu em relação à execução anterior da mesma conta
  const saques = useMemo(() => {
    const withBalance = allData.filter(r => r.balance !== null && r.balance !== undefined);
    // Agrupar por conta, ordenado por data crescente
    const byAccount = {};
    for (const r of withBalance) {
      if (!byAccount[r.account_name]) byAccount[r.account_name] = [];
      byAccount[r.account_name].push(r);
    }
    const result = [];
    for (const records of Object.values(byAccount)) {
      records.sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at));
      for (let i = 1; i < records.length; i++) {
        const prev = records[i - 1];
        const curr = records[i];
        const valPrev = parseBalance(prev.balance);
        const valCurr = parseBalance(curr.balance);
        if (valPrev > 0 && valCurr < valPrev) {
          result.push({
            account: curr.account_name,
            platform: curr.platform,
            date: curr.executed_at,
            anterior: valPrev,
            atual: valCurr,
            saque: valPrev - valCurr,
          });
        }
      }
    }
    return result.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [allData]);

  const totalSaques = useMemo(
    () => saques.reduce((s, r) => s + r.saque, 0),
    [saques]
  );

  // Total de saques por conta
  const saquesPorConta = useMemo(() => {
    const map = {};
    for (const s of saques) {
      if (!map[s.account]) map[s.account] = { account: s.account, platform: s.platform, total: 0, count: 0 };
      map[s.account].total += s.saque;
      map[s.account].count += 1;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [saques]);

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

      {/* Saques Detectados */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownCircle size={16} className="text-red-400" />
            <h3 className="font-semibold text-white">Saques Detectados (últimos 30 dias)</h3>
          </div>
          {saques.length > 0 && (
            <span className="text-xs text-gray-500">{saques.length} evento(s)</span>
          )}
        </div>

        {saques.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">
            <Wallet size={28} className="mx-auto mb-2 opacity-30" />
            <p>Nenhum saque detectado no período.</p>
          </div>
        ) : (
          <>
            {/* Cards de resumo por conta */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 border-b border-gray-800">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-red-300 mb-1">Total sacado</p>
                <p className="text-xl font-bold text-white">R$ {totalSaques.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">{saquesPorConta.length} conta(s)</p>
              </div>
              {saquesPorConta.map((s, i) => (
                <div key={s.account} className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-500 truncate mb-1">{s.account}</p>
                  <p className="text-lg font-bold text-red-400">- R$ {s.total.toFixed(2)}</p>
                  <p className="text-xs text-gray-600 mt-1">{s.count} saque(s)</p>
                </div>
              ))}
            </div>

            {/* Tabela de eventos */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-gray-800/50 text-left">
                  <tr>
                    <th className="px-5 py-3 font-medium text-gray-400">Data</th>
                    <th className="px-5 py-3 font-medium text-gray-400">Conta</th>
                    <th className="px-5 py-3 font-medium text-gray-400">Plataforma</th>
                    <th className="px-5 py-3 font-medium text-gray-400">Saldo Anterior</th>
                    <th className="px-5 py-3 font-medium text-gray-400">Saldo Atual</th>
                    <th className="px-5 py-3 font-medium text-gray-400">Saque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {saques.map((s, i) => (
                    <tr key={i} className="hover:bg-gray-800/40">
                      <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(s.date).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-100">{s.account}</td>
                      <td className="px-5 py-3 text-gray-400">{s.platform || '—'}</td>
                      <td className="px-5 py-3 text-gray-400">R$ {s.anterior.toFixed(2)}</td>
                      <td className="px-5 py-3 text-gray-400">R$ {s.atual.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                          <ArrowDownCircle size={13} />
                          R$ {s.saque.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
