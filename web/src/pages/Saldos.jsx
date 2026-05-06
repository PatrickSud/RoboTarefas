import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowDownCircle, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Filter, History, Plus, Settings, Trash2, Wallet, X } from 'lucide-react';

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

function normalizeDeposits(entries) {
  return Array.isArray(entries)
    ? entries
        .map(entry => ({
          id: entry.id || `${Date.now()}-${Math.random()}`,
          amount: Number(entry.amount) || 0,
          date: entry.date || new Date().toISOString().slice(0, 10),
        }))
        .filter(entry => entry.amount > 0)
    : [];
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
  const [monthlyWithdrawals, setMonthlyWithdrawals] = useState([]);
  const [withdrawalFees, setWithdrawalFees] = useState({});
  const [exchangeConfigs, setExchangeConfigs] = useState({});
  const [depositEntries, setDepositEntries] = useState({});
  const [depositDrafts, setDepositDrafts] = useState({});
  const [movementFilter, setMovementFilter] = useState('all');
  const [summarySort, setSummarySort] = useState('platform');
  const [editingFeeFor, setEditingFeeFor] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: accountsData, error: accountsError }, { data: resultsData }, { data: monthlyData }] = await Promise.all([
        supabase
          .from('accounts')
          .select('id,name,platform,phone,active,sort_order,selected_for_total,selected_for_withdrawals,withdrawal_fee,currency_symbol,exchange_rate,deposit_entries')
          .eq('active', true)
          .order('sort_order', { ascending: true, nullsFirst: false }),
        supabase
          .from('account_run_results')
          .select('id,account_id,account_name,platform,phone,status,balance,tasks_completed,executed_at,error_message')
          .not('balance', 'is', null)
          .order('executed_at', { ascending: false })
          .limit(1000),
        supabase
          .from('monthly_withdrawals')
          .select('*')
          .order('year', { ascending: false })
          .order('month', { ascending: false }),
      ]);

      if (accountsError) {
        alert(`Erro ao carregar contas/saldos: ${accountsError.message}`);
        setLoading(false);
        return;
      }

      const accountsArray = accountsData || [];
      const fees = {};
      const configs = {};
      const deposits = {};
      const selTotal = [];
      const selWith = [];

      for (const acc of accountsArray) {
        const key = accountKey(acc);
        fees[key] = acc.withdrawal_fee || 0;
        configs[key] = { symbol: acc.currency_symbol || '', rate: acc.exchange_rate || 1 };
        deposits[key] = normalizeDeposits(acc.deposit_entries);
        
        if (acc.selected_for_total !== false) selTotal.push(key);
        if (acc.selected_for_withdrawals !== false) selWith.push(key);
      }

      setWithdrawalFees(fees);
      setExchangeConfigs(configs);
      setDepositEntries(deposits);
      setSelectedForTotal(new Set(selTotal));
      setSelectedForWithdrawals(new Set(selWith));

      setAccounts(accountsArray);
      setResults(resultsData || []);
      setMonthlyWithdrawals(monthlyData || []);
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
        id: account.id,
        name: account.name,
        platform: latest?.platform || account.platform,
        phone: latest?.phone || account.phone,
        active: account.active,
        latest,
        rawBalance,
        balanceValue,
        currencySymbol: ex.symbol,
        exchangeRate: ex.rate || 1,
        deposits: depositEntries[key] || [],
      };
    });

    return merged.sort((a, b) => {
      const platA = String(a.platform || '').toLowerCase();
      const platB = String(b.platform || '').toLowerCase();
      if (platA < platB) return -1;
      if (platA > platB) return 1;
      const nameA = String(a.name || '').toLowerCase();
      const nameB = String(b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [accounts, results, exchangeConfigs, depositEntries]);

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
      .slice(0, 30)
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
      const depositTotal = (depositEntries[account.key] || []).reduce((sum, entry) => sum + entry.amount, 0);
      const depositWithdrawalNet = net - depositTotal;
      return {
        ...account,
        withdrawalCount: withdrawals.length,
        withdrawalTotal: gross,
        withdrawalNet: net,
        depositTotal,
        depositWithdrawalNet,
        withdrawalFee: fee,
        latestWithdrawal: withdrawals[0] || null,
      };
    }).filter(account => account.withdrawalCount > 0 || account.depositTotal > 0)
  ), [summaries, withdrawalsByAccount, withdrawalFees, depositEntries]);

  const consolidatedWithdrawalsTotal = useMemo(() => (
    withdrawalSummaries.reduce((sum, account) => (
      selectedForWithdrawals.has(account.key) ? sum + account.withdrawalTotal : sum
    ), 0)
  ), [withdrawalSummaries, selectedForWithdrawals]);

  const consolidatedWithdrawalsNet = useMemo(() => (
    withdrawalSummaries.reduce((sum, account) => (
      selectedForWithdrawals.has(account.key) ? sum + account.depositWithdrawalNet : sum
    ), 0)
  ), [withdrawalSummaries, selectedForWithdrawals]);

  const consolidatedDepositsTotal = useMemo(() => (
    withdrawalSummaries.reduce((sum, account) => (
      selectedForWithdrawals.has(account.key) ? sum + account.depositTotal : sum
    ), 0)
  ), [withdrawalSummaries, selectedForWithdrawals]);

  const consolidatedWithdrawalsNetOnly = useMemo(() => (
    withdrawalSummaries.reduce((sum, account) => (
      selectedForWithdrawals.has(account.key) ? sum + account.withdrawalNet : sum
    ), 0)
  ), [withdrawalSummaries, selectedForWithdrawals]);

  const monthlyGrouped = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // 1. Calculate current month live from withdrawalSummaries
    const currentMonthTotal = withdrawalSummaries.reduce((sum, acc) => {
      if (!selectedForWithdrawals.has(acc.key)) return sum;
      const currentMonthWithdrawals = (withdrawalsByAccount.get(acc.key) || []).filter(w => {
        const d = new Date(w.date);
        return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth;
      });
      const gross = currentMonthWithdrawals.reduce((s, w) => s + w.amount, 0);
      const fee = withdrawalFees[acc.key] || 0;
      const deposits = (depositEntries[acc.key] || []).filter(entry => {
        const d = new Date(entry.date);
        return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth;
      }).reduce((s, entry) => s + entry.amount, 0);
      return sum + (gross * (1 - fee / 100)) - deposits;
    }, 0);

    // 2. Process history from database, excluding current month to avoid double counting if synced
    const history = [];
    const months = new Set();
    
    // Group DB data by Month-Year
    monthlyWithdrawals.forEach(item => {
      // Skip current month from DB as we calculate it live
      if (item.year === currentYear && item.month === currentMonth) return;
      
      const mKey = `${item.year}-${item.month}`;
      months.add(mKey);
    });

    Array.from(months).forEach(mKey => {
      const [year, month] = mKey.split('-').map(Number);
      const net = monthlyWithdrawals
        .filter(item => item.year === year && item.month === month && selectedForWithdrawals.has(item.account_key))
        .reduce((sum, item) => sum + Number(item.total_net), 0);
      const deposits = Object.entries(depositEntries).reduce((sum, [accountKeyValue, entries]) => {
        if (!selectedForWithdrawals.has(accountKeyValue)) return sum;
        return sum + entries
          .filter(entry => {
            const d = new Date(entry.date);
            return d.getFullYear() === year && (d.getMonth() + 1) === month;
          })
          .reduce((entrySum, entry) => entrySum + entry.amount, 0);
      }, 0);
      
      history.push({ year, month, net: net - deposits });
    });

    return [
      { year: currentYear, month: currentMonth, net: currentMonthTotal, isCurrent: true },
      ...history.sort((a, b) => b.year - a.year || b.month - a.month)
    ];
  }, [monthlyWithdrawals, withdrawalSummaries, selectedForWithdrawals, withdrawalsByAccount, withdrawalFees, depositEntries]);

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const selectedWithdrawalHistory = useMemo(() => (
    withdrawalsByAccount.get(withdrawalModalAccount) || []
  ), [withdrawalsByAccount, withdrawalModalAccount]);

  const summariesWithMovement = useMemo(() => (
    summaries.map(account => {
      const movement = withdrawalSummaries.find(item => item.key === account.key);
      return {
        ...account,
        withdrawalCount: movement?.withdrawalCount || 0,
        withdrawalTotal: movement?.withdrawalTotal || 0,
        withdrawalNet: movement?.withdrawalNet || 0,
        depositTotal: movement?.depositTotal || 0,
        depositWithdrawalNet: movement?.depositWithdrawalNet || 0,
        withdrawalFee: movement?.withdrawalFee || withdrawalFees[account.key] || 0,
        latestWithdrawal: movement?.latestWithdrawal || null,
      };
    })
  ), [summaries, withdrawalSummaries, withdrawalFees]);

  const displaySummaries = useMemo(() => {
    const filtered = summariesWithMovement.filter(account => {
      if (movementFilter === 'positive') return account.depositWithdrawalNet > 0;
      if (movementFilter === 'negative') return account.depositWithdrawalNet < 0;
      if (movementFilter === 'none') return account.withdrawalNet === 0 && account.depositTotal === 0;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (summarySort === 'balance') return b.balanceValue - a.balanceValue;
      if (summarySort === 'withdrawals') return b.withdrawalNet - a.withdrawalNet;
      if (summarySort === 'deposits') return b.depositTotal - a.depositTotal;
      if (summarySort === 'result') return b.depositWithdrawalNet - a.depositWithdrawalNet;

      const platA = String(a.platform || '').toLowerCase();
      const platB = String(b.platform || '').toLowerCase();
      if (platA < platB) return -1;
      if (platA > platB) return 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [summariesWithMovement, movementFilter, summarySort]);

  function updateAccountField(key, fields) {
    if (key.startsWith('account:')) {
      const id = key.replace('account:', '');
      supabase.from('accounts').update(fields).eq('id', id).then();
    }
  }

  function toggleAccount(accountKey) {
    setSelectedForTotal(prev => {
      const next = new Set(prev);
      const isSelected = next.has(accountKey);
      if (isSelected) next.delete(accountKey);
      else next.add(accountKey);
      updateAccountField(accountKey, { selected_for_total: !isSelected });
      return next;
    });
  }

  function toggleWithdrawalAccount(accountKey) {
    setSelectedForWithdrawals(prev => {
      const next = new Set(prev);
      const isSelected = next.has(accountKey);
      if (isSelected) next.delete(accountKey);
      else next.add(accountKey);
      updateAccountField(accountKey, { selected_for_withdrawals: !isSelected });
      return next;
    });
  }

  function selectAll() {
    const allKeys = summaries.map(account => account.key);
    setSelectedForTotal(new Set(allKeys));
    setSelectedForWithdrawals(new Set(allKeys));
    
    // Atualiza o banco para todas as contas
    Promise.all(summaries.map(s => 
      s.key.startsWith('account:') ? supabase.from('accounts').update({ 
        selected_for_total: true, 
        selected_for_withdrawals: true 
      }).eq('id', s.key.replace('account:', '')) : Promise.resolve()
    ));
  }

  function clearSelection() {
    setSelectedForTotal(new Set());
    setSelectedForWithdrawals(new Set());
    
    // Atualiza o banco para todas as contas
    Promise.all(summaries.map(s => 
      s.key.startsWith('account:') ? supabase.from('accounts').update({ 
        selected_for_total: false, 
        selected_for_withdrawals: false 
      }).eq('id', s.key.replace('account:', '')) : Promise.resolve()
    ));
  }

  function saveConfig(key, feeValue, symbolValue, rateValue) {
    const rawFee = parseFloat(feeValue);
    const fee = Number.isNaN(rawFee) || rawFee < 0 ? 0 : rawFee > 100 ? 100 : rawFee;
    setWithdrawalFees(prev => ({ ...prev, [key]: fee }));

    const rawRate = parseFloat(rateValue);
    const rate = Number.isNaN(rawRate) || rawRate <= 0 ? 1 : rawRate;
    const symbol = String(symbolValue || '').trim();
    
    setExchangeConfigs(prev => ({ ...prev, [key]: { symbol, rate } }));

    if (key.startsWith('account:')) {
      const id = key.replace('account:', '');
      supabase.from('accounts').update({
        withdrawal_fee: fee,
        currency_symbol: symbol,
        exchange_rate: rate
      }).eq('id', id).then(({ error }) => {
        if (error) console.error('Erro ao salvar config:', error.message);
      });
    }

    setEditingFeeFor(null);
  }

  function saveDeposits(key, deposits) {
    const normalized = normalizeDeposits(deposits);
    const previous = depositEntries[key] || [];
    setDepositEntries(prev => ({ ...prev, [key]: normalized }));

    if (key.startsWith('account:')) {
      const id = key.replace('account:', '');
      supabase.from('accounts').update({ deposit_entries: normalized }).eq('id', id).then(({ error }) => {
        if (error) {
          setDepositEntries(prev => ({ ...prev, [key]: previous }));
          console.error('Erro ao salvar depósitos:', error.message);
          alert(`Erro ao salvar depósito: ${error.message}`);
        }
      });
    } else {
      alert('Não foi possível salvar depósito porque esta conta não existe mais na guia Contas.');
    }
  }

  function addDeposit(key, amountValue, dateValue) {
    const amount = parseFloat(String(amountValue || '').replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      alert('Informe um valor de depósito maior que zero.');
      return;
    }

    const next = [
      ...(depositEntries[key] || []),
      {
        id: `${Date.now()}-${Math.random()}`,
        amount,
        date: dateValue || new Date().toISOString().slice(0, 10),
      },
    ];
    setSelectedForWithdrawals(prev => {
      const nextSelected = new Set(prev);
      nextSelected.add(key);
      return nextSelected;
    });
    updateAccountField(key, { selected_for_withdrawals: true });
    saveDeposits(key, next);
    setDepositDrafts(prev => ({
      ...prev,
      [key]: { amount: '', date: dateValue || new Date().toISOString().slice(0, 10) },
    }));
  }

  function removeDeposit(key, id) {
    const next = (depositEntries[key] || []).filter(entry => entry.id !== id);
    saveDeposits(key, next);
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
        <h2 className="text-xl md:text-2xl font-bold text-white">Saldos & Depósito/Saque</h2>
        <p className="text-sm text-gray-500 mt-1">Acompanhe as movimentações consolidadas e individuais das suas contas.</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-xl mb-6">
        <div className="bg-gradient-to-r from-indigo-600/20 to-emerald-600/20 px-4 py-3 sm:px-6 sm:py-5 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="text-indigo-400" size={18} />
                Resumo Consolidado
              </h3>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">Visão geral das contas selecionadas para monitoramento</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {/* Saldo Atual */}
            <div className="relative">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Saldo Atual</p>
              <p className="text-2xl font-black text-white">{formatCurrency(consolidatedTotal)}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                <p className="text-[10px] text-indigo-400/80 font-medium">{selectedForTotal.size} contas somando</p>
              </div>
            </div>

            {/* Depósitos */}
            <div className="relative">
              <div className="hidden lg:block absolute left-[-16px] top-0 bottom-0 w-[1px] bg-gray-800"></div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Depósitos</p>
              <p className="text-2xl font-black text-white">{formatCurrency(consolidatedDepositsTotal)}</p>
              <p className="text-[10px] text-gray-500 mt-2 font-medium">Total investido</p>
            </div>

            {/* Saques Líquidos */}
            <div className="relative">
              <div className="hidden lg:block absolute left-[-16px] top-0 bottom-0 w-[1px] bg-gray-800"></div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Saques Líquidos</p>
              <p className="text-2xl font-black text-emerald-400">{formatCurrency(consolidatedWithdrawalsNetOnly)}</p>
              <p className="text-[10px] text-emerald-500/60 mt-2 font-medium">Retorno líquido recebido</p>
            </div>

            {/* Resultado Final */}
            <div className="relative">
              <div className="hidden lg:block absolute left-[-16px] top-0 bottom-0 w-[1px] bg-gray-800"></div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Resultado Final</p>
              <p className={`text-2xl font-black ${consolidatedWithdrawalsNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(consolidatedWithdrawalsNet)}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <p className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${consolidatedWithdrawalsNet >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  {consolidatedWithdrawalsNet >= 0 ? 'LUCRO' : 'PREJUÍZO'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300">
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-900 hover:bg-gray-800/50 transition-colors lg:hidden"
        >
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-indigo-400" />
            <span className="text-sm font-semibold text-white">Visualização das contas</span>
          </div>
          {showFilters ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
        </button>

        <div className={`${showFilters ? 'block' : 'hidden'} lg:block px-4 py-4 lg:py-3 border-t border-gray-800 lg:border-t-0`}>
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-white">Visualização das contas</p>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">{displaySummaries.length} de {summaries.length} contas exibidas</p>
            </div>
            
            <div className="flex flex-col sm:flex-row lg:items-end gap-3">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 ml-1">Filtro de Resultado</label>
                <select
                  value={movementFilter}
                  onChange={event => setMovementFilter(event.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="all">Todas as contas</option>
                  <option value="positive">Com lucro líquido</option>
                  <option value="negative">Com prejuízo líquido</option>
                  <option value="none">Sem movimentação</option>
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 ml-1">Ordenar por</label>
                <select
                  value={summarySort}
                  onChange={event => setSummarySort(event.target.value)}
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="platform">Plataforma / Nome</option>
                  <option value="balance">Maior saldo atual</option>
                  <option value="withdrawals">Maior saque líquido</option>
                  <option value="deposits">Maior depósito total</option>
                  <option value="result">Melhor resultado final</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1 ml-1">Seleção em Lote</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={selectAll} 
                      className="flex-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 rounded-xl border border-indigo-500/30 transition-all"
                    >
                      Todas
                    </button>
                    <button 
                      onClick={clearSelection} 
                      className="flex-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-gray-500 hover:text-white rounded-xl border border-gray-700 transition-all"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {displaySummaries.map(account => {
          const checked = selectedForTotal.has(account.key);
          const platformColor = getPlatformColor(account.platform);
          const ws = account;
          const isEditingFee = editingFeeFor === account.key;
          const depositDraft = depositDrafts[account.key] || {
            amount: '',
            date: new Date().toISOString().slice(0, 10),
          };

          function toggleBoth() {
            const isSelected = selectedForTotal.has(account.key);
            toggleAccount(account.key);
            setSelectedForWithdrawals(prev => {
              const next = new Set(prev);
              if (isSelected) next.delete(account.key);
              else next.add(account.key);
              updateAccountField(account.key, { selected_for_withdrawals: !isSelected });
              return next;
            });
          }

          return (
            <div key={account.key} className="bg-gray-900 rounded-2xl border border-gray-800 flex flex-col overflow-visible hover:border-gray-700 transition-colors relative">
              {/* Header */}
              <div
                className={`px-4 py-3 border-b border-gray-800 flex justify-between items-start rounded-t-2xl cursor-pointer select-none transition-colors ${checked ? 'bg-indigo-500/5' : ''}`}
                style={{ borderTop: `3px solid ${platformColor}` }}
                onClick={toggleBoth}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1">
                  <span className={`shrink-0 ${checked ? 'text-indigo-400' : 'text-gray-600'}`}>
                    {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-100 truncate text-sm leading-tight" title={account.name}>{account.name}</h3>
                    <p className="text-[10px] text-gray-500 truncate leading-tight">{account.platform || 'Sem plataforma'}</p>
                    {account.phone && <p className="text-[10px] text-gray-600 truncate leading-tight">{account.phone}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setModalAccount(account.key)} className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors" title="Histórico de saldos">
                    <History size={16} />
                  </button>
                  {ws && (
                    <button onClick={() => setWithdrawalModalAccount(account.key)} className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors" title="Histórico de saques">
                      <ArrowDownCircle size={16} />
                    </button>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingFeeFor(isEditingFee ? null : account.key); }}
                    className={`p-1.5 rounded-lg transition-colors ${(withdrawalFees[account.key] > 0) || account.exchangeRate !== 1 || (depositEntries[account.key] || []).length > 0 ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
                    title="Configurações da Conta"
                  >
                    <Settings size={16} />
                  </button>
                </div>
              </div>
              
              {/* Settings Popover */}
              {isEditingFee && (
                <div className="absolute top-12 left-2 right-2 mx-auto max-w-[260px] p-4 bg-gray-800 border border-gray-700 rounded-xl z-50 shadow-xl flex flex-col gap-4" onClick={e => e.stopPropagation()}>
                  <div>
                    <label className="text-xs text-gray-300 font-medium block mb-1">Taxa de Saque (%)</label>
                    <input
                      type="number"
                      id={`fee-${account.key}`}
                      min="0" max="100" step="0.1"
                      defaultValue={withdrawalFees[account.key] || 0}
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
                  <div>
                    <div className="flex items-center justify-between mb-2 border-b border-gray-700 pb-1">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Depósitos</h4>
                      <button
                        type="button"
                        onClick={() => addDeposit(account.key, depositDraft.amount, depositDraft.date)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
                        title="Adicionar depósito"
                      >
                        <Plus size={14} />
                        Incluir
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Valor"
                        value={depositDraft.amount}
                        onChange={event => setDepositDrafts(prev => ({
                          ...prev,
                          [account.key]: { ...depositDraft, amount: event.target.value },
                        }))}
                        className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
                      />
                      <input
                        type="date"
                        value={depositDraft.date}
                        onChange={event => setDepositDrafts(prev => ({
                          ...prev,
                          [account.key]: { ...depositDraft, date: event.target.value },
                        }))}
                        className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="mt-2 max-h-24 overflow-auto space-y-1">
                      {(depositEntries[account.key] || []).length === 0 ? (
                        <p className="text-[10px] text-gray-500">Nenhum depósito informado.</p>
                      ) : (
                        [...(depositEntries[account.key] || [])].sort((a, b) => new Date(b.date) - new Date(a.date)).map(entry => (
                          <div key={entry.id} className="flex items-center justify-between gap-2 text-[11px] text-gray-300 bg-gray-900/70 rounded-lg px-2 py-1">
                            <span>{new Date(entry.date).toLocaleDateString('pt-BR')} • {formatCurrency(entry.amount)}</span>
                            <button type="button" onClick={() => removeDeposit(account.key, entry.id)} className="text-gray-500 hover:text-red-400">
                              <X size={12} />
                            </button>
                          </div>
                        ))
                      )}
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
                <div className="p-2.5 sm:p-3 rounded-xl bg-gray-800/30">
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

                {/* Depósito/Saque Block */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-gray-800/30">
                  <p className="text-[10px] sm:text-[11px] font-medium text-gray-400 mb-2 uppercase tracking-wide">Depósito/Saque</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-gray-500">Depósitos</span>
                      <span className="text-xs font-semibold text-sky-300">{formatCurrency(ws.depositTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-gray-500">Saques líquidos</span>
                      <span className="text-xs font-semibold text-emerald-300">{formatCurrency(ws.withdrawalNet)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-700/70">
                      <span className="text-[10px] text-gray-400 font-medium">Resultado</span>
                      <span className={`text-sm font-bold ${ws.depositWithdrawalNet >= 0 ? 'text-emerald-400' : 'text-red-300'}`}>
                        {formatCurrency(ws.depositWithdrawalNet)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] sm:text-[10px] text-gray-500 truncate mt-2">
                    {ws.withdrawalCount > 0 ? `${ws.withdrawalCount} saque(s) detectado(s)` : 'Sem saques detectados'}
                  </p>
                </div>
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
        {summaries.length > 0 && displaySummaries.length === 0 && (
          <div className="col-span-full p-12 text-center border border-dashed border-gray-800 rounded-2xl">
            <Wallet size={32} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">Nenhuma conta encontrada para o filtro selecionado.</p>
          </div>
        )}
      </div>

      {/* Depósito/Saque por Mês */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownCircle size={20} className="text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Depósito/Saque por Mês</h2>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {monthlyGrouped.map((m, i) => (
            <div key={`${m.year}-${m.month}`} className={`p-4 rounded-2xl border ${m.isCurrent ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-gray-800/40 border-gray-700/50'}`}>
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{monthNames[m.month - 1]} {m.year}</p>
                {m.isCurrent && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase">Vigente</span>}
              </div>
              <p className={`text-xl font-bold ${m.isCurrent ? 'text-white' : 'text-gray-300'}`}>{formatCurrency(m.net)}</p>
              <p className="text-[10px] text-gray-500 mt-1">Saques líquidos - depósitos</p>
            </div>
          ))}
        </div>
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

      {/* Modal Historico de Depósito/Saque */}
      {withdrawalModalAccount && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setWithdrawalModalAccount(null)}>
          <div className="relative bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ArrowDownCircle size={18} className="text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">Histórico de Depósito/Saque</h3>
                  <p className="text-xs text-gray-500 truncate">
                    {withdrawalModalSummary?.name || withdrawalModalAccount}
                    {withdrawalModalSummary?.platform ? ` • ${withdrawalModalSummary.platform}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">{selectedWithdrawalHistory.length} saque(s) detectado(s)</span>
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
                      <th className="px-5 py-3 font-medium text-gray-400">Saque detectado</th>
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
