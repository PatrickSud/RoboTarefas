import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, ArrowDownCircle, Wallet, Trash2, Plus, X, Settings } from 'lucide-react';
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#818cf8','#34d399','#fb923c','#f472b6','#60a5fa','#a78bfa','#facc15'];

function parseBalance(val) {
  const n = parseFloat(String(val ?? '0').replace(/[^\d,./]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function AccountModal({ account, ledger, runData, saquesData, onClose, onAdd, onDelete, onDeleteAuto }) {
  const [tab, setTab] = useState(0);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const excludedBalIds = new Set(
    ledger.filter(e => e.account_name === account && e.type === 'exclude_balance').map(e => e.note)
  );
  const excludedSaqKeys = new Set(
    ledger.filter(e => e.account_name === account && e.type === 'exclude_saque').map(e => e.note)
  );

  const balanceEntries = [
    ...runData.filter(r => !excludedBalIds.has(r.id))
      .map(r => ({ id: r.id, kind: 'auto', date: r.executed_at, amount: parseBalance(r.balance), note: 'Capturado pelo robô' })),
    ...ledger.filter(e => e.account_name === account && e.type === 'balance')
      .map(e => ({ id: e.id, kind: 'manual', date: e.date, amount: Number(e.amount), note: e.note || 'Ajuste manual' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const withdrawalEntries = [
    ...saquesData.filter(s => !excludedSaqKeys.has(s.date))
      .map(s => ({ id: s.date, kind: 'auto', date: s.date, amount: s.saque, note: `De R$ ${s.anterior.toFixed(2)} → R$ ${s.atual.toFixed(2)}` })),
    ...ledger.filter(e => e.account_name === account && e.type === 'withdrawal')
      .map(e => ({ id: e.id, kind: 'manual', date: e.date, amount: Number(e.amount), note: e.note || 'Saque manual' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const entries = tab === 0 ? balanceEntries : withdrawalEntries;

  async function handleAdd() {
    if (!amount || isNaN(parseFloat(amount))) return;
    setSaving(true);
    await onAdd(account, tab === 0 ? 'balance' : 'withdrawal', parseFloat(amount), note);
    setAmount(''); setNote(''); setSaving(false);
  }

  function handleDelete(entry) {
    if (entry.kind === 'manual') onDelete(entry.id);
    else onDeleteAuto(account, entry.id, tab === 0 ? 'balance' : 'saque');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative bg-gray-900 rounded-xl border border-gray-800 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="font-semibold text-white">{account}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex border-b border-gray-800 shrink-0">
          <button onClick={() => setTab(0)} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 0 ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
            Saldo Atual <span className="text-xs ml-1 opacity-50">({balanceEntries.length})</span>
          </button>
          <button onClick={() => setTab(1)} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 1 ? 'text-red-400 border-b-2 border-red-400' : 'text-gray-500 hover:text-gray-300'}`}>
            Saques <span className="text-xs ml-1 opacity-50">({withdrawalEntries.length})</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {entries.length === 0 ? (
            <p className="text-center text-gray-600 text-sm py-8">Nenhum lançamento.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium text-xs">Data</th>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium text-xs">Valor</th>
                  <th className="px-4 py-2 text-left text-gray-400 font-medium text-xs">Origem / Obs</th>
                  <th className="px-4 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {entries.map((e, idx) => (
                  <tr key={`${e.id}-${idx}`} className="hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(e.date).toLocaleDateString('pt-BR')}</td>
                    <td className={`px-4 py-2.5 font-medium text-sm ${tab === 0 ? 'text-green-400' : 'text-red-400'}`}>R$ {e.amount.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {e.kind === 'auto'
                        ? <span className="text-indigo-400/70">{e.note}</span>
                        : <span className="text-gray-500">{e.note}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDelete(e)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="border-t border-gray-800 p-3 flex gap-2 shrink-0">
          <input type="number" placeholder="Valor" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-24 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500" />
          <input type="text" placeholder="Observação (opcional)" value={note} onChange={e => setNote(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500" />
          <button onClick={handleAdd} disabled={saving || !amount}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 shrink-0">
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Financeiro() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState([]);
  const [modalAccount, setModalAccount] = useState(null);
  const [currencyRates, setCurrencyRates] = useState({});
  const [showCurrencyConfig, setShowCurrencyConfig] = useState(false);
  const [editRates, setEditRates] = useState({});

  useEffect(() => {
    async function load() {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('account_run_results')
        .select('id, account_name, balance, platform, tasks_completed, status, executed_at')
        .gte('executed_at', since.toISOString())
        .order('executed_at', { ascending: true });
      if (data) setAllData(data);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    supabase.from('financial_ledger').select('*').order('date', { ascending: false })
      .then(({ data }) => { if (data) setLedger(data); });
  }, []);

  useEffect(() => {
    supabase.from('global_settings').select('value').eq('key', 'currency_rates').maybeSingle()
      .then(({ data }) => {
        const parsed = data?.value ? JSON.parse(data.value) : {};
        setCurrencyRates(parsed);
        setEditRates(parsed);
      });
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

  // Total de saques por conta (usado na seção Saques Detectados)
  const saquesPorConta = useMemo(() => {
    const map = {};
    for (const s of saques) {
      if (!map[s.account]) map[s.account] = { account: s.account, platform: s.platform, total: 0, count: 0 };
      map[s.account].total += s.saque;
      map[s.account].count += 1;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [saques]);

  // Resumo por conta: Saldo Atual, Saques no Mês, Saques Totais (respeita exclusões)
  const accountSummaries = useMemo(() => {
    const accs = [...new Set(allData.map(r => r.account_name))];
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return accs.map((acc, i) => {
      const excludedBalIds = new Set(
        ledger.filter(e => e.account_name === acc && e.type === 'exclude_balance').map(e => e.note)
      );
      const excludedSaqKeys = new Set(
        ledger.filter(e => e.account_name === acc && e.type === 'exclude_saque').map(e => e.note)
      );
      const runs = allData.filter(r => r.account_name === acc && r.balance != null && !excludedBalIds.has(r.id));
      runs.sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
      const latestBal = runs.length > 0 ? parseBalance(runs[0].balance) : 0;
      const balAdj = ledger.filter(e => e.account_name === acc && e.type === 'balance')
        .reduce((s, e) => s + Number(e.amount), 0);
      const platform = runs[0]?.platform || allData.find(r => r.account_name === acc)?.platform;
      const rateConfig = currencyRates[platform];
      const convRate = rateConfig?.rate ? Number(rateConfig.rate) : 1;
      const saldoAtual = (latestBal * convRate) + balAdj;
      const accSaques = saques.filter(s => s.account === acc && !excludedSaqKeys.has(s.date));
      const autoTotal = accSaques.reduce((s, e) => s + e.saque * convRate, 0);
      const autoMes = accSaques.filter(s => (s.date || '').slice(0, 7) === mesAtual)
        .reduce((s, e) => s + e.saque * convRate, 0);
      const manWd = ledger.filter(e => e.account_name === acc && e.type === 'withdrawal');
      const manTotal = manWd.reduce((s, e) => s + Number(e.amount), 0);
      const manMes = manWd.filter(e => (e.date || '').slice(0, 7) === mesAtual)
        .reduce((s, e) => s + Number(e.amount), 0);
      return {
        account: acc,
        platform,
        saldoAtual,
        currency: rateConfig ? { symbol: rateConfig.symbol, raw: latestBal } : null,
        saquesMes: autoMes + manMes,
        saquesTotal: autoTotal + manTotal,
        color: COLORS[i % COLORS.length],
      };
    });
  }, [allData, ledger, saques, currencyRates]);

  async function addLedgerEntry(account, type, amount, note) {
    const { data } = await supabase.from('financial_ledger').insert({
      account_name: account, type, amount, note, date: new Date().toISOString()
    }).select().single();
    if (data) setLedger(prev => [data, ...prev]);
  }

  async function deleteLedgerEntry(id) {
    await supabase.from('financial_ledger').delete().eq('id', id);
    setLedger(prev => prev.filter(e => e.id !== id));
  }

  async function saveCurrencyRates() {
    await supabase.from('global_settings').upsert(
      { key: 'currency_rates', value: JSON.stringify(editRates) },
      { onConflict: 'key' }
    );
    setCurrencyRates({ ...editRates });
    setShowCurrencyConfig(false);
  }

  async function addLedgerExclusion(account, sourceId, sourceType) {
    const type = sourceType === 'balance' ? 'exclude_balance' : 'exclude_saque';
    const { data } = await supabase.from('financial_ledger').insert({
      account_name: account, type, amount: 0, note: sourceId, date: new Date().toISOString()
    }).select().single();
    if (data) setLedger(prev => [data, ...prev]);
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
      {modalAccount && (
        <AccountModal
          account={modalAccount}
          ledger={ledger}
          runData={allData.filter(r => r.account_name === modalAccount && r.balance != null)}
          saquesData={saques.filter(s => s.account === modalAccount)}
          onClose={() => setModalAccount(null)}
          onAdd={addLedgerEntry}
          onDelete={deleteLedgerEntry}
          onDeleteAuto={addLedgerExclusion}
        />
      )}

      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Financeiro</h2>

      {/* Carteira por conta */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="px-4 md:px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white">Carteira por Conta</h3>
            <p className="text-xs text-gray-500 mt-0.5">Clique em uma conta para gerenciar lançamentos</p>
          </div>
          <button onClick={() => setShowCurrencyConfig(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 mt-0.5 ${showCurrencyConfig ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}>
            <Settings size={12} /> Câmbio
          </button>
        </div>
        {showCurrencyConfig && (
          <div className="px-4 md:px-5 py-4 border-b border-gray-800 bg-gray-800/30">
            <p className="text-xs text-gray-400 mb-3">Taxa de conversão para BRL por plataforma. Deixe em branco para usar o valor original.</p>
            <div className="flex flex-col gap-2">
              {[...new Set(allData.map(r => r.platform).filter(Boolean))].map(p => (
                <div key={p} className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs w-28 shrink-0 truncate">{p}</span>
                  <input
                    placeholder="Símbolo (ex: GTQ)"
                    value={editRates[p]?.symbol || ''}
                    onChange={ev => setEditRates(prev => ({ ...prev, [p]: { ...prev[p], symbol: ev.target.value } }))}
                    className="w-24 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="number"
                    placeholder="1 [moeda] = ? BRL"
                    value={editRates[p]?.rate || ''}
                    onChange={ev => setEditRates(prev => ({ ...prev, [p]: { ...prev[p], rate: ev.target.value } }))}
                    className="w-36 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {editRates[p]?.rate && editRates[p]?.symbol && (
                    <span className="text-gray-600 text-xs">1 {editRates[p].symbol} = R$ {Number(editRates[p].rate).toFixed(4)}</span>
                  )}
                </div>
              ))}
            </div>
            <button onClick={saveCurrencyRates} className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
              <Plus size={12} /> Salvar configurações
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-gray-800/50 text-left">
              <tr>
                <th className="px-5 py-3 font-medium text-gray-400">Conta</th>
                <th className="px-5 py-3 font-medium text-gray-400">Saldo Atual</th>
                <th className="px-5 py-3 font-medium text-gray-400">Saques no Mês</th>
                <th className="px-5 py-3 font-medium text-gray-400">Saques Totais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {accountSummaries.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-600 text-sm">Sem dados.</td></tr>
              ) : accountSummaries.map(acc => (
                <tr key={acc.account} className="hover:bg-gray-800/40 cursor-pointer transition-colors"
                    onClick={() => setModalAccount(acc.account)}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-100">{acc.account}</p>
                    {acc.platform && <p className="text-xs mt-0.5" style={{ color: acc.color }}>{acc.platform}</p>}
                  </td>
                  <td className="px-5 py-3 font-semibold text-white">
                    R$ {acc.saldoAtual.toFixed(2)}
                    {acc.currency && (
                      <span className="block text-xs text-gray-500 font-normal mt-0.5">{acc.currency.symbol} {acc.currency.raw.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-red-400">R$ {acc.saquesMes.toFixed(2)}</td>
                  <td className="px-5 py-3 text-red-400">R$ {acc.saquesTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
