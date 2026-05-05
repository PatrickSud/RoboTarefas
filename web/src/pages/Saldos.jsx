import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle2, Circle, Clock, History, Trash2, Wallet, X } from 'lucide-react';

function parseBalance(value) {
  const normalized = String(value ?? '0')
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return 'Sem execução';
  return new Date(value).toLocaleString('pt-BR');
}

function formatDayKey(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function accountKey(account) {
  return `account:${account.id || `${normalizeKey(account.name)}|${normalizeKey(account.platform)}|${normalizeKey(account.phone)}`}`;
}

function resultKey(result) {
  if (result.account_id) return `account:${result.account_id}`;
  return `result:${normalizeKey(result.account_name)}|${normalizeKey(result.platform)}|${normalizeKey(result.phone)}`;
}

export default function Saldos() {
  const [accounts, setAccounts] = useState([]);
  const [results, setResults] = useState([]);
  const [modalAccount, setModalAccount] = useState(null);
  const [selectedForTotal, setSelectedForTotal] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    async function load() {
      const [{ data: accountsData }, { data: resultsData }] = await Promise.all([
        supabase
          .from('accounts')
          .select('id,name,platform,phone,active,sort_order')
          .order('sort_order', { ascending: true, nullsFirst: false }),
        supabase
          .from('account_run_results')
          .select('id,account_id,account_name,platform,phone,status,balance,tasks_completed,executed_at,error_message')
          .not('balance', 'is', null)
          .order('executed_at', { ascending: false })
          .limit(1000),
      ]);

      setAccounts(accountsData || []);
      setResults(resultsData || []);
      setLoading(false);
    }

    load();
  }, []);

  const summaries = useMemo(() => {
    const latestByKey = new Map();
    for (const result of results) {
      const key = resultKey(result);
      if (!latestByKey.has(key)) latestByKey.set(key, result);
    }

    const uniqueAccounts = [];
    const accountKeys = new Set();
    for (const account of accounts) {
      const key = accountKey(account);
      if (accountKeys.has(key)) continue;
      accountKeys.add(key);
      uniqueAccounts.push(account);
    }

    const merged = uniqueAccounts.map(account => {
      const key = accountKey(account);
      const fallbackKey = `result:${normalizeKey(account.name)}|${normalizeKey(account.platform)}|${normalizeKey(account.phone)}`;
      const latest = latestByKey.get(key) || latestByKey.get(fallbackKey);
      return {
        key,
        name: account.name,
        platform: latest?.platform || account.platform,
        phone: latest?.phone || account.phone,
        active: account.active,
        latest,
        balanceValue: parseBalance(latest?.balance),
      };
    });

    for (const result of latestByKey.values()) {
      const key = resultKey(result);
      const fallbackAccountKey = result.account_id ? `account:${result.account_id}` : null;
      if (!accountKeys.has(key) && (!fallbackAccountKey || !accountKeys.has(fallbackAccountKey))) {
        merged.push({
          key,
          name: result.account_name,
          platform: result.platform,
          phone: result.phone,
          active: true,
          latest: result,
          balanceValue: parseBalance(result.balance),
        });
      }
    }

    return merged;
  }, [accounts, results]);

  useEffect(() => {
    if (summaries.length === 0) return;
    setSelectedForTotal(prev => {
      if (prev.size > 0) return prev;
      return new Set(summaries.map(account => account.key));
    });
  }, [summaries]);

  const consolidatedTotal = useMemo(() => (
    summaries.reduce((sum, account) => (
      selectedForTotal.has(account.key) ? sum + account.balanceValue : sum
    ), 0)
  ), [summaries, selectedForTotal]);

  const modalSummary = useMemo(() => (
    summaries.find(account => account.key === modalAccount) || null
  ), [summaries, modalAccount]);

  const selectedHistory = useMemo(() => (
    results
      .filter(result => {
        if (resultKey(result) === modalAccount) return true;
        if (!modalSummary) return false;
        return normalizeKey(result.account_name) === normalizeKey(modalSummary.name)
          && normalizeKey(result.platform) === normalizeKey(modalSummary.platform)
          && normalizeKey(result.phone) === normalizeKey(modalSummary.phone);
      })
      .filter((result, index, list) => {
        const key = `${resultKey(result)}|${parseBalance(result.balance).toFixed(2)}|${formatDayKey(result.executed_at)}`;
        return list.findIndex(item => (
          `${resultKey(item)}|${parseBalance(item.balance).toFixed(2)}|${formatDayKey(item.executed_at)}` === key
        )) === index;
      })
      .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at))
  ), [results, modalAccount, modalSummary]);

  function toggleAccount(accountKey) {
    setSelectedForTotal(prev => {
      const next = new Set(prev);
      if (next.has(accountKey)) next.delete(accountKey);
      else next.add(accountKey);
      return next;
    });
  }

  function selectAll() {
    setSelectedForTotal(new Set(summaries.map(account => account.key)));
  }

  function clearSelection() {
    setSelectedForTotal(new Set());
  }

  async function deleteHistoryRow(row) {
    if (!confirm(`Excluir este registro de histórico da conta "${row.account_name}"?`)) return;
    setDeletingId(row.id);
    const { error } = await supabase.from('account_run_results').delete().eq('id', row.id);
    setDeletingId(null);

    if (error) {
      alert('Erro ao excluir histórico: ' + error.message);
      return;
    }

    setResults(prev => prev.filter(result => result.id !== row.id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white">Saldos</h2>
          <p className="text-sm text-gray-500 mt-1">Saldo atual capturado pelo robô e histórico de movimentação por conta.</p>
        </div>
        <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl px-5 py-4 min-w-64">
          <p className="text-xs text-indigo-300">Saldo consolidado selecionado</p>
          <p className="text-3xl font-bold text-white mt-1">{formatCurrency(consolidatedTotal)}</p>
          <p className="text-xs text-gray-500 mt-1">{selectedForTotal.size} de {summaries.length} conta(s)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet size={18} className="text-indigo-400" />
              <div>
                <h3 className="font-semibold text-white">Contas e saldo atual</h3>
                <p className="text-xs text-gray-500">Marque as contas que entram no consolidado.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors">Selecionar todas</button>
              <button onClick={clearSelection} className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:border-red-500 hover:text-red-300 transition-colors">Limpar</button>
            </div>
          </div>

          <div className="divide-y divide-gray-800">
            {summaries.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">Nenhum saldo capturado ainda.</div>
            ) : summaries.map(account => {
              const checked = selectedForTotal.has(account.key);
              return (
                <button
                  key={account.key}
                  onClick={() => setModalAccount(account.key)}
                  className="w-full text-left p-4 transition-colors hover:bg-gray-800/40"
                >
                  <div className="flex items-center gap-4">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={event => { event.stopPropagation(); toggleAccount(account.key); }}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleAccount(account.key); } }}
                      className={`shrink-0 rounded-full transition-colors ${checked ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-300'}`}
                      title={checked ? 'Remover do consolidado' : 'Adicionar ao consolidado'}
                    >
                      {checked ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-100 truncate">{account.name}</p>
                          <p className="text-xs text-gray-500 truncate">{account.platform || 'Sem plataforma'} {account.phone ? `• ${account.phone}` : ''}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-lg font-bold text-white">{formatCurrency(account.balanceValue)}</p>
                          <p className="text-xs text-gray-500">{formatDate(account.latest?.executed_at)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {modalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setModalAccount(null)}>
          <div className="relative bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <History size={18} className="text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">Histórico da conta</h3>
                  <p className="text-xs text-gray-500 truncate">
                    {modalSummary?.name || modalAccount}
                    {modalSummary?.platform ? ` • ${modalSummary.platform}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">{selectedHistory.length} registro(s)</span>
                <button onClick={() => setModalAccount(null)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {selectedHistory.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">
                <Clock size={28} className="mx-auto mb-2 opacity-30" />
                <p>Nenhuma movimentação registrada para esta conta.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-gray-800/50 text-left sticky top-0">
                    <tr>
                      <th className="px-5 py-3 font-medium text-gray-400">Data</th>
                      <th className="px-5 py-3 font-medium text-gray-400">Saldo</th>
                      <th className="px-5 py-3 font-medium text-gray-400">Status</th>
                      <th className="px-5 py-3 font-medium text-gray-400">Tarefas</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {selectedHistory.map(row => (
                      <tr key={row.id} className="hover:bg-gray-800/40">
                        <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(row.executed_at)}</td>
                        <td className="px-5 py-3 font-semibold text-white">{formatCurrency(parseBalance(row.balance))}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${row.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {row.status === 'success' ? 'Sucesso' : 'Erro'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-400">{row.tasks_completed ?? '—'}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => deleteHistoryRow(row)}
                            disabled={deletingId === row.id}
                            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                            title="Excluir linha do histórico"
                          >
                            {deletingId === row.id ? <X size={15} /> : <Trash2 size={15} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
