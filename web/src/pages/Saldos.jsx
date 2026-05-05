import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowDownCircle, CheckCircle2, Circle, Clock, History, Settings, Trash2, Wallet, X } from 'lucide-react';

const SELECTION_STORAGE_KEY = 'saldos_selected_accounts';
const WITHDRAWAL_SELECTION_STORAGE_KEY = 'saldos_selected_withdrawal_accounts';
const WITHDRAWAL_FEES_STORAGE_KEY = 'saldos_withdrawal_fees';

const PLATFORM_COLORS = {
  'Platform1': '#818cf8',
  'Platform2': '#34d399',
  'Platform3': '#fb923c',
  'Platform4': '#f472b6',
  'Platform5': '#60a5fa',
  'Platform6': '#a78bfa',
  'Platform7': '#facc15',
};

function getPlatformColor(platform) {
  return PLATFORM_COLORS[platform] || '#ffffff';
}

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

function loadSavedSelection(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return Array.isArray(saved) ? new Set(saved) : null;
  } catch {
    return null;
  }
}

export default function Saldos() {
  const [accounts, setAccounts] = useState([]);
  const [results, setResults] = useState([]);
  const [modalAccount, setModalAccount] = useState(null);
  const [withdrawalModalAccount, setWithdrawalModalAccount] = useState(null);
  const [selectedForTotal, setSelectedForTotal] = useState(new Set());
  const [selectedForWithdrawals, setSelectedForWithdrawals] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [withdrawalFees, setWithdrawalFees] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(WITHDRAWAL_FEES_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [editingFeeFor, setEditingFeeFor] = useState(null);

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
      const saved = loadSavedSelection(SELECTION_STORAGE_KEY);
      if (saved) return new Set([...saved].filter(key => summaries.some(account => account.key === key)));
      return new Set(summaries.map(account => account.key));
    });
  }, [summaries]);

  useEffect(() => {
    if (summaries.length === 0) return;
    setSelectedForWithdrawals(prev => {
      if (prev.size > 0) return prev;
      const saved = loadSavedSelection(WITHDRAWAL_SELECTION_STORAGE_KEY);
      if (saved) return new Set([...saved].filter(key => summaries.some(account => account.key === key)));
      return new Set(summaries.map(account => account.key));
    });
  }, [summaries]);

  useEffect(() => {
    if (summaries.length === 0) return;
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...selectedForTotal]));
  }, [selectedForTotal, summaries.length]);

  useEffect(() => {
    if (summaries.length === 0) return;
    localStorage.setItem(WITHDRAWAL_SELECTION_STORAGE_KEY, JSON.stringify([...selectedForWithdrawals]));
  }, [selectedForWithdrawals, summaries.length]);

  const consolidatedTotal = useMemo(() => (
    summaries.reduce((sum, account) => (
      selectedForTotal.has(account.key) ? sum + account.balanceValue : sum
    ), 0)
  ), [summaries, selectedForTotal]);

  const modalSummary = useMemo(() => (
    summaries.find(account => account.key === modalAccount) || null
  ), [summaries, modalAccount]);

  const withdrawalModalSummary = useMemo(() => (
    summaries.find(account => account.key === withdrawalModalAccount) || null
  ), [summaries, withdrawalModalAccount]);

  function resultMatchesSummary(result, summary) {
    if (!summary) return false;
    if (resultKey(result) === summary.key) return true;
    return normalizeKey(result.account_name) === normalizeKey(summary.name)
      && normalizeKey(result.platform) === normalizeKey(summary.platform)
      && normalizeKey(result.phone) === normalizeKey(summary.phone);
  }

  function dedupeBalanceHistory(history) {
    return history
      .filter((result, index, list) => {
        const key = `${resultKey(result)}|${parseBalance(result.balance).toFixed(2)}|${formatDayKey(result.executed_at)}`;
        return list.findIndex(item => (
          `${resultKey(item)}|${parseBalance(item.balance).toFixed(2)}|${formatDayKey(item.executed_at)}` === key
        )) === index;
      });
  }

  const selectedHistory = useMemo(() => (
    dedupeBalanceHistory(results.filter(result => resultMatchesSummary(result, modalSummary)))
      .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at))
  ), [results, modalSummary]);

  const withdrawalsByAccount = useMemo(() => {
    const map = new Map();
    for (const summary of summaries) {
      const history = dedupeBalanceHistory(results.filter(result => resultMatchesSummary(result, summary)))
        .sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at));
      const withdrawals = [];
      for (let index = 1; index < history.length; index += 1) {
        const previous = history[index - 1];
        const current = history[index];
        const previousBalance = parseBalance(previous.balance);
        const currentBalance = parseBalance(current.balance);
        if (previousBalance > 0 && currentBalance < previousBalance) {
          withdrawals.push({
            id: current.id,
            accountKey: summary.key,
            accountName: summary.name,
            platform: summary.platform,
            phone: summary.phone,
            date: current.executed_at,
            previousBalance,
            currentBalance,
            amount: previousBalance - currentBalance,
            row: current,
          });
        }
      }
      map.set(summary.key, withdrawals.sort((a, b) => new Date(b.date) - new Date(a.date)));
    }
    return map;
  }, [summaries, results]);

  const withdrawalSummaries = useMemo(() => (
    summaries.map(account => {
      const withdrawals = withdrawalsByAccount.get(account.key) || [];
      const gross = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
      const fee = withdrawalFees[account.key] ?? 0;
      const net = gross * (1 - fee / 100);
      return {
        ...account,
        withdrawalCount: withdrawals.length,
        withdrawalTotal: gross,
        withdrawalNet: net,
        withdrawalFee: fee,
        latestWithdrawal: withdrawals[0] || null,
      };
    }).filter(account => account.withdrawalCount > 0)
  ), [summaries, withdrawalsByAccount, withdrawalFees]);

  const consolidatedWithdrawalsTotal = useMemo(() => (
    withdrawalSummaries.reduce((sum, account) => (
      selectedForWithdrawals.has(account.key) ? sum + account.withdrawalTotal : sum
    ), 0)
  ), [withdrawalSummaries, selectedForWithdrawals]);

  const consolidatedWithdrawalsNet = useMemo(() => (
    withdrawalSummaries.reduce((sum, account) => (
      selectedForWithdrawals.has(account.key) ? sum + account.withdrawalNet : sum
    ), 0)
  ), [withdrawalSummaries, selectedForWithdrawals]);

  const selectedWithdrawalHistory = useMemo(() => (
    withdrawalsByAccount.get(withdrawalModalAccount) || []
  ), [withdrawalsByAccount, withdrawalModalAccount]);

  function toggleAccount(accountKey) {
    setSelectedForTotal(prev => {
      const next = new Set(prev);
      if (next.has(accountKey)) next.delete(accountKey);
      else next.add(accountKey);
      return next;
    });
  }

  function toggleWithdrawalAccount(accountKey) {
    setSelectedForWithdrawals(prev => {
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

  function selectAllWithdrawals() {
    setSelectedForWithdrawals(new Set(withdrawalSummaries.map(account => account.key)));
  }

  function clearWithdrawalSelection() {
    setSelectedForWithdrawals(new Set());
  }

  function saveFee(accountKey, value) {
    const raw = parseFloat(value);
    const fee = Number.isNaN(raw) || raw < 0 ? 0 : raw > 100 ? 100 : raw;
    setWithdrawalFees(prev => {
      const next = { ...prev, [accountKey]: fee };
      localStorage.setItem(WITHDRAWAL_FEES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setEditingFeeFor(null);
  }

  async function deleteHistoryRow(row) {
    console.log('Tentando excluir registro de histórico:', row);

    if (!row || !row.id) {
      console.error('Dados do registro inválidos para exclusão:', row);
      return;
    }

    const accountName = row.account_name || 'Conta desconhecida';
    if (!confirm(`Excluir este registro de histórico da conta "${accountName}"?`)) {
      console.log('Exclusão cancelada pelo usuário');
      return;
    }

    try {
      setDeletingId(row.id);
      console.log('Chamando Supabase para deletar id:', row.id);
      const { error } = await supabase.from('account_run_results').delete().eq('id', row.id);
      setDeletingId(null);

      if (error) {
        console.error('Erro retornado pelo Supabase:', error);
        alert('Erro ao excluir histórico: ' + error.message);
        return;
      }

      console.log('Exclusão bem-sucedida no banco, atualizando estado local');
      setResults(prev => prev.filter(result => result.id !== row.id));
    } catch (err) {
      console.error('Erro inesperado na função deleteHistoryRow:', err);
      setDeletingId(null);
      alert('Ocorreu um erro inesperado ao tentar excluir o registro.');
    }
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

      <section className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-red-400" />
            <div>
              <h3 className="font-semibold text-white">Saques</h3>
              <p className="text-xs text-gray-500">Reduções de saldo detectadas automaticamente por conta.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-xs text-red-300">Saques consolidados selecionados</p>
              <p className="text-2xl font-bold text-white mt-1">{formatCurrency(consolidatedWithdrawalsNet)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Bruto {formatCurrency(consolidatedWithdrawalsTotal)}
                {' • '}{selectedForWithdrawals.size} de {withdrawalSummaries.length} conta(s)
              </p>
            </div>
            <div className="flex gap-2 mt-2 sm:mt-0">
              <button onClick={selectAllWithdrawals} className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:border-red-500 hover:text-red-300 transition-colors">Selecionar todas</button>
              <button onClick={clearWithdrawalSelection} className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:border-red-500 hover:text-red-300 transition-colors">Limpar</button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {withdrawalSummaries.length === 0 ? (
            <div className="p-8 text-center text-gray-600 text-sm">
              <ArrowDownCircle size={28} className="mx-auto mb-2 opacity-30" />
              <p>Nenhum saque detectado pelo histórico de saldos.</p>
            </div>
          ) : withdrawalSummaries.map(account => {
            const checked = selectedForWithdrawals.has(account.key);
            const isEditingFee = editingFeeFor === account.key;
            return (
              <div key={account.key} className="relative">
                <button
                  onClick={() => setWithdrawalModalAccount(account.key)}
                  className="w-full text-left p-4 pr-12 transition-colors hover:bg-gray-800/40"
                  style={{ borderColor: getPlatformColor(account.platform) }}
                >
                  <div className="flex items-center gap-4">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={event => { event.stopPropagation(); toggleWithdrawalAccount(account.key); }}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleWithdrawalAccount(account.key); } }}
                      className={`shrink-0 rounded-full transition-colors ${checked ? 'text-red-400' : 'text-gray-600 hover:text-gray-300'}`}
                      title={checked ? 'Remover do consolidado de saques' : 'Adicionar ao consolidado de saques'}
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
                          <p className="text-lg font-bold text-red-400">-{formatCurrency(account.withdrawalNet)}</p>
                          <p className="text-xs text-gray-500">
                            Bruto -{formatCurrency(account.withdrawalTotal)}
                            {account.withdrawalFee > 0 ? ` (${account.withdrawalFee}% taxa)` : ''}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {account.withdrawalCount} saque(s)
                            {account.latestWithdrawal ? ` • último em ${formatDate(account.latestWithdrawal.date)}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={event => { event.stopPropagation(); setEditingFeeFor(isEditingFee ? null : account.key); }}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setEditingFeeFor(isEditingFee ? null : account.key); } }}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                  title="Configurar taxa de saque"
                >
                  <Settings size={16} />
                </span>
                {isEditingFee && (
                  <div className="px-4 pb-4 flex items-center gap-2" onClick={event => event.stopPropagation()}>
                    <label className="text-xs text-gray-400 shrink-0">Taxa %:</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      defaultValue={account.withdrawalFee}
                      onKeyDown={event => { if (event.key === 'Enter') saveFee(account.key, event.currentTarget.value); if (event.key === 'Escape') setEditingFeeFor(null); }}
                      className="w-20 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {modalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setModalAccount(null)}>
          <div className="relative bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <History size={18} className="text-indigo-400" />
                <div>
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

      {withdrawalModalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setWithdrawalModalAccount(null)}>
          <div className="relative bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowDownCircle size={18} className="text-red-400" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">Histórico de saques</h3>
                  <p className="text-xs text-gray-500 truncate">
                    {withdrawalModalSummary?.name || withdrawalModalAccount}
                    {withdrawalModalSummary?.platform ? ` • ${withdrawalModalSummary.platform}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">{selectedWithdrawalHistory.length} saque(s)</span>
                <button onClick={() => setWithdrawalModalAccount(null)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>

            {selectedWithdrawalHistory.length === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">
                <Clock size={28} className="mx-auto mb-2 opacity-30" />
                <p>Nenhum saque detectado para esta conta.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead className="bg-gray-800/50 text-left sticky top-0">
                    <tr>
                      <th className="px-5 py-3 font-medium text-gray-400">Data</th>
                      <th className="px-5 py-3 font-medium text-gray-400">Saldo anterior</th>
                      <th className="px-5 py-3 font-medium text-gray-400">Saldo atual</th>
                      <th className="px-5 py-3 font-medium text-gray-400">Saque</th>
                      <th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {selectedWithdrawalHistory.map(withdrawal => (
                      <tr key={withdrawal.id} className="hover:bg-gray-800/40">
                        <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(withdrawal.date)}</td>
                        <td className="px-5 py-3 text-gray-400">{formatCurrency(withdrawal.previousBalance)}</td>
                        <td className="px-5 py-3 text-gray-400">{formatCurrency(withdrawal.currentBalance)}</td>
                        <td className="px-5 py-3 font-semibold text-red-400">-{formatCurrency(withdrawal.amount)}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => deleteHistoryRow(withdrawal.row)}
                            disabled={deletingId === withdrawal.id}
                            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                            title="Excluir linha que gerou este saque"
                          >
                            {deletingId === withdrawal.id ? <X size={15} /> : <Trash2 size={15} />}
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
