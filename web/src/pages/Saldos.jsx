import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowDownCircle, CheckCircle2, Circle, Clock, History, Settings, Trash2, Wallet, X } from 'lucide-react';

const SELECTION_STORAGE_KEY = 'saldos_selected_accounts';
const WITHDRAWAL_SELECTION_STORAGE_KEY = 'saldos_selected_withdrawal_accounts';
const WITHDRAWAL_FEES_STORAGE_KEY = 'saldos_withdrawal_fees';
const EXCHANGE_CONFIGS_STORAGE_KEY = 'saldos_exchange_configs';
const COLORS = ['#818cf8', '#34d399', '#fb923c', '#f472b6', '#60a5fa', '#a78bfa', '#facc15'];

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

function platformKey(platform) {
  return normalizeKey(platform || 'Sem plataforma');
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
  const [exchangeConfigs, setExchangeConfigs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(EXCHANGE_CONFIGS_STORAGE_KEY) || '{}');
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
      
      const rawBalance = parseBalance(latest?.balance);
      const ex = exchangeConfigs[key] || { rate: 1, symbol: '' };
      const balanceValue = rawBalance * (ex.rate || 1);

      return {
        key,
        name: account.name,
        platform: latest?.platform || account.platform,
        phone: latest?.phone || account.phone,
        active: account.active,
        latest,
        rawBalance,
        balanceValue,
        currencySymbol: ex.symbol,
        exchangeRate: ex.rate || 1,
      };
    });

    for (const result of latestByKey.values()) {
      const key = resultKey(result);
      const fallbackAccountKey = result.account_id ? `account:${result.account_id}` : null;
      if (!accountKeys.has(key) && (!fallbackAccountKey || !accountKeys.has(fallbackAccountKey))) {
        const rawBalance = parseBalance(result.balance);
        const ex = exchangeConfigs[key] || { rate: 1, symbol: '' };
        const balanceValue = rawBalance * (ex.rate || 1);
        
        merged.push({
          key,
          name: result.account_name,
          platform: result.platform,
          phone: result.phone,
          active: true,
          latest: result,
          rawBalance,
          balanceValue,
          currencySymbol: ex.symbol,
          exchangeRate: ex.rate || 1,
        });
      }
    }

    return merged.sort((a, b) => {
      const platA = String(a.platform || '').toLowerCase();
      const platB = String(b.platform || '').toLowerCase();
      if (platA < platB) return -1;
      if (platA > platB) return 1;
      const nameA = String(a.name || '').toLowerCase();
      const nameB = String(b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [accounts, results]);

  const initTotalRef = useRef(false);
  const initWithdrawalRef = useRef(false);

  useEffect(() => {
    if (summaries.length === 0) return;
    if (!initTotalRef.current) {
      initTotalRef.current = true;
      const saved = loadSavedSelection(SELECTION_STORAGE_KEY);
      if (saved) {
        setSelectedForTotal(new Set([...saved].filter(key => summaries.some(account => account.key === key))));
      } else {
        setSelectedForTotal(new Set(summaries.map(account => account.key)));
      }
    } else {
      localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...selectedForTotal]));
    }
  }, [summaries, selectedForTotal]);

  useEffect(() => {
    if (summaries.length === 0) return;
    if (!initWithdrawalRef.current) {
      initWithdrawalRef.current = true;
      const saved = loadSavedSelection(WITHDRAWAL_SELECTION_STORAGE_KEY);
      if (saved) {
        setSelectedForWithdrawals(new Set([...saved].filter(key => summaries.some(account => account.key === key))));
      } else {
        setSelectedForWithdrawals(new Set(summaries.map(account => account.key)));
      }
    } else {
      localStorage.setItem(WITHDRAWAL_SELECTION_STORAGE_KEY, JSON.stringify([...selectedForWithdrawals]));
    }
  }, [summaries, selectedForWithdrawals]);

  const consolidatedTotal = useMemo(() => (
    summaries.reduce((sum, account) => (
      selectedForTotal.has(account.key) ? sum + account.balanceValue : sum
    ), 0)
  ), [summaries, selectedForTotal]);

  const platformColors = useMemo(() => {
    const colors = new Map();
    for (const account of summaries) {
      const key = platformKey(account.platform);
      if (!colors.has(key)) colors.set(key, COLORS[colors.size % COLORS.length]);
    }
    return colors;
  }, [summaries]);

  function getPlatformColor(platform) {
    return platformColors.get(platformKey(platform)) || COLORS[0];
  }

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
        const ex = exchangeConfigs[summary.key] || { rate: 1 };
        const rate = ex.rate || 1;
        
        const previousBalance = parseBalance(previous.balance) * rate;
        const currentBalance = parseBalance(current.balance) * rate;
        
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

  function saveConfig(accountKey, feeValue, symbolValue, rateValue) {
    const rawFee = parseFloat(feeValue);
    const fee = Number.isNaN(rawFee) || rawFee < 0 ? 0 : rawFee > 100 ? 100 : rawFee;
    setWithdrawalFees(prev => {
      const next = { ...prev, [accountKey]: fee };
      localStorage.setItem(WITHDRAWAL_FEES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });

    const rawRate = parseFloat(rateValue);
    const rate = Number.isNaN(rawRate) || rawRate <= 0 ? 1 : rawRate;
    const symbol = String(symbolValue || '').trim();
    
    setExchangeConfigs(prev => {
      const next = { ...prev, [accountKey]: { symbol, rate } };
      localStorage.setItem(EXCHANGE_CONFIGS_STORAGE_KEY, JSON.stringify(next));
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
      <div className="mb-2">
        <h2 className="text-xl md:text-2xl font-bold text-white">Saldos & Saques</h2>
        <p className="text-sm text-gray-500 mt-1">Acompanhe as movimentações consolidadas e individuais das suas contas.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Total Saldo */}
        <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl px-5 py-4 flex flex-col justify-between">
          <div>
            <p className="text-xs text-indigo-300 font-semibold uppercase tracking-wider">Saldo Consolidado</p>
            <p className="text-3xl font-bold text-white mt-1">{formatCurrency(consolidatedTotal)}</p>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-indigo-500/20">
            <p className="text-xs text-indigo-200/60">{selectedForTotal.size} de {summaries.length} contas ativas</p>
            <div className="flex gap-3">
              <button onClick={selectAll} className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">Todas</button>
              <button onClick={clearSelection} className="text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors">Nenhuma</button>
            </div>
          </div>
        </div>

        {/* Total Saques */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 flex flex-col justify-between">
          <div>
            <p className="text-xs text-red-300 font-semibold uppercase tracking-wider">Saques Consolidados (Líquido)</p>
            <p className="text-3xl font-bold text-white mt-1">{formatCurrency(consolidatedWithdrawalsNet)}</p>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-red-500/20">
            <p className="text-xs text-red-200/60">
              Bruto {formatCurrency(consolidatedWithdrawalsTotal)} • {selectedForWithdrawals.size} de {withdrawalSummaries.length}
            </p>
            <div className="flex gap-3">
              <button onClick={selectAllWithdrawals} className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors">Todas</button>
              <button onClick={clearWithdrawalSelection} className="text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors">Nenhuma</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {summaries.map(account => {
          const checkedTotal = selectedForTotal.has(account.key);
          const platformColor = getPlatformColor(account.platform);
          const ws = withdrawalSummaries.find(w => w.key === account.key);
          const hasWithdrawals = !!ws;
          const checkedWithdrawal = hasWithdrawals && selectedForWithdrawals.has(account.key);
          const isEditingFee = editingFeeFor === account.key;

          return (
            <div key={account.key} className="bg-gray-900 rounded-2xl border border-gray-800 flex flex-col overflow-visible hover:border-gray-700 transition-colors relative">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-start rounded-t-2xl" style={{ borderTop: `3px solid ${platformColor}` }}>
                <div className="min-w-0 pr-2">
                  <h3 className="font-semibold text-gray-100 truncate" title={account.name}>{account.name}</h3>
                  <p className="text-xs text-gray-500 truncate">{account.platform || 'Sem plataforma'} {account.phone ? `• ${account.phone}` : ''}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setModalAccount(account.key)} className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors" title="Histórico de saldos">
                    <History size={16} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingFeeFor(isEditingFee ? null : account.key); }}
                    className={`p-1.5 rounded-lg transition-colors ${ws?.withdrawalFee > 0 || account.exchangeRate !== 1 ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
                    title="Configurações da Conta"
                  >
                    <Settings size={16} />
                  </button>
                  {hasWithdrawals && (
                    <button onClick={() => setWithdrawalModalAccount(account.key)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors" title="Histórico de saques">
                      <ArrowDownCircle size={16} />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Settings Popover */}
              {isEditingFee && (
                <div className="absolute top-12 right-2 p-4 w-64 bg-gray-800 border border-gray-700 rounded-xl z-20 shadow-xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                  <div>
                    <label className="text-xs text-gray-300 font-medium block mb-1">Taxa de Saque (%)</label>
                    <input
                      type="number"
                      id={`fee-${account.key}`}
                      min="0" max="100" step="0.1"
                      defaultValue={ws?.withdrawalFee || 0}
                      className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 border-b border-gray-700 pb-1">Câmbio de Moeda</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Símbolo</label>
                        <input type="text" id={`sym-${account.key}`} defaultValue={account.currencySymbol} placeholder="ex: US$" className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-indigo-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">Cotação (R$)</label>
                        <input type="number" id={`rate-${account.key}`} step="0.01" min="0.01" defaultValue={account.exchangeRate} className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-indigo-500 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const feeVal = document.getElementById(`fee-${account.key}`).value;
                      const symVal = document.getElementById(`sym-${account.key}`).value;
                      const rateVal = document.getElementById(`rate-${account.key}`).value;
                      saveConfig(account.key, feeVal, symVal, rateVal);
                    }}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Salvar Configurações
                  </button>
                </div>
              )}

              {/* Body */}
              <div className="p-3 sm:p-4 flex-1 flex flex-col gap-3">
                {/* Saldo Block */}
                <div 
                  className={`relative p-2.5 sm:p-3 rounded-xl border cursor-pointer transition-colors ${checkedTotal ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-gray-800/30 border-transparent hover:bg-gray-800/50'}`}
                  onClick={() => toggleAccount(account.key)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-0.5 shrink-0 ${checkedTotal ? 'text-indigo-400' : 'text-gray-600'}`}>
                      {checkedTotal ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] sm:text-[11px] font-medium text-gray-400 mb-1 uppercase tracking-wide">Saldo Atual</p>
                      <div className="flex items-baseline gap-1.5 flex-wrap mb-1">
                        <p className="text-base sm:text-lg font-bold text-white leading-none truncate">{formatCurrency(account.balanceValue)}</p>
                        {account.exchangeRate !== 1 && (
                          <p className="text-[10px] text-gray-500 truncate" title="Moeda original">
                            ({account.currencySymbol} {formatCurrency(account.rawBalance).replace('R$', '').trim()})
                          </p>
                        )}
                      </div>
                      <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">
                        {formatDate(account.latest?.executed_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Saques Block */}
                {hasWithdrawals ? (
                  <div className="relative">
                    <div 
                      className={`relative p-2.5 sm:p-3 rounded-xl border cursor-pointer transition-colors ${checkedWithdrawal ? 'bg-red-500/10 border-red-500/30' : 'bg-gray-800/30 border-transparent hover:bg-gray-800/50'}`}
                      onClick={() => toggleWithdrawalAccount(account.key)}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-0.5 shrink-0 ${checkedWithdrawal ? 'text-red-400' : 'text-gray-600'}`}>
                          {checkedWithdrawal ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-[11px] font-medium text-gray-400 mb-1 uppercase tracking-wide">Saques ({ws.withdrawalCount})</p>
                          <p className="text-base sm:text-lg font-bold text-red-400 leading-none truncate mb-1">-{formatCurrency(ws.withdrawalNet)}</p>
                          <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">Bruto -{formatCurrency(ws.withdrawalTotal)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 border border-dashed border-gray-800 rounded-xl flex items-center justify-center p-3">
                    <p className="text-[11px] text-gray-600">Nenhum saque detectado</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {summaries.length === 0 && (
          <div className="col-span-full p-12 text-center border border-dashed border-gray-800 rounded-2xl">
            <Wallet size={32} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">Nenhum saldo ou conta cadastrada.</p>
          </div>
        )}
      </div>

      {/* Modal Historico de Saldo */}
      {modalAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setModalAccount(null)}>
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
                  <thead className="bg-gray-800/50 text-left sticky top-0 z-10">
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

      {/* Modal Historico de Saques */}
      {withdrawalModalAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setWithdrawalModalAccount(null)}>
          <div className="relative bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowDownCircle size={18} className="text-red-400 shrink-0" />
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
                  <thead className="bg-gray-800/50 text-left sticky top-0 z-10">
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
