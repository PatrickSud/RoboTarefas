import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Clock, Activity, Play, Power, Wifi, WifiOff, RefreshCw, Terminal, ChevronDown, ChevronUp, X, Image } from 'lucide-react';

function PrintModal({ url, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white hover:text-gray-300 flex items-center gap-1 text-sm">
          <X size={18} /> Fechar
        </button>
        <img src={url} alt="Print" className="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl border border-gray-700" />
      </div>
    </div>
  );
}

async function parseApiResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: text
        ? `A API retornou uma resposta inválida: ${text.slice(0, 120)}`
        : `A API retornou uma resposta vazia (HTTP ${response.status}).`
    };
  }
}

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const [schedule, setSchedule] = useState({ enabled: false, hour: 8 });
  const [autoShutdown, setAutoShutdown] = useState(true);
  const [awsStatus, setAwsStatus] = useState('unknown'); // 'online' | 'offline' | 'unknown'
  const [logs, setLogs] = useState('');
  const [logsOpen, setLogsOpen] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [livePolling, setLivePolling] = useState(false);
  const [modalUrl, setModalUrl] = useState(null);
  const logsRef = useRef(null);

  async function fetchLatestResults() {
    const [{ data: configSchedule }, { data: configPrefs }, { data: accounts }] = await Promise.all([
      supabase.from('global_settings').select('value').eq('key', 'schedule').single(),
      supabase.from('global_settings').select('value').eq('key', 'preferences').single(),
      supabase.from('accounts').select('id,name,platform,phone,active,sort_order').eq('active', true).order('sort_order', { ascending: true, nullsFirst: false }),
    ]);

    if (configSchedule) setSchedule(configSchedule.value);
    if (configPrefs) setAutoShutdown(configPrefs.value.auto_shutdown ?? true);

    const { data, error } = await supabase
      .from('account_run_results')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(1000);

    if (!error && data) {
      const latestByAccount = {};
      for (const row of data) {
        if (!latestByAccount[row.account_name]) latestByAccount[row.account_name] = row;
      }
      const merged = (accounts || []).map(account => {
        const latest = latestByAccount[account.name];
        return latest || {
          id: `account-${account.id}`,
          account_id: account.id,
          account_name: account.name,
          platform: account.platform,
          phone: account.phone,
          status: 'pending',
          tasks_completed: '-',
          balance: '',
          screenshot_path: '',
          executed_at: null,
        };
      });
      const accountNames = new Set((accounts || []).map(a => a.name));
      const orphanResults = Object.values(latestByAccount).filter(row => !accountNames.has(row.account_name));
      setResults([...merged, ...orphanResults]);
    }
    setLoading(false);
  }

  async function checkAwsStatus() {
    try {
      const res = await fetch('/api/run-robot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'health' }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok && data.message) setRunMessage(data.message);
      setAwsStatus(data.ok ? 'online' : 'offline');
    } catch { setAwsStatus('offline'); }
  }

  async function fetchLogs() {
    if (!livePolling) setLogsLoading(true);
    try {
      const res = await fetch('/api/run-robot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logs' }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok && data.message) setRunMessage(data.message);
      setLogs(data.logs || '(Sem logs disponíveis)');
      setTimeout(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, 100);
    } catch { setLogs('(Erro ao buscar logs)'); }
    if (!livePolling) setLogsLoading(false);
  }

  useEffect(() => {
    fetchLatestResults();
    checkAwsStatus();
    fetchLogs();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'account_run_results' }, () => {
        fetchLatestResults();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!livePolling) return;

    let cancelled = false;

    async function refreshLive() {
      if (cancelled) return;
      await Promise.all([checkAwsStatus(), fetchLogs(), fetchLatestResults()]);
    }

    refreshLive();
    const interval = setInterval(refreshLive, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [livePolling]);

  async function handleRunNow() {
    setRunning(true);
    setLivePolling(true);
    setLogsOpen(true);
    setRunMessage('Ligando servidor AWS...');

    const callFunction = async (action) => {
      const res = await fetch('/api/run-robot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, autoShutdown }),
      });
      const data = await parseApiResponse(res);
      if (!res.ok) throw new Error(data.message || `Erro HTTP ${res.status}`);
      return data;
    };

    try {
      // 1. Liga a instância
      await callFunction('start');

      // 2. Poll de saúde (máximo 3 minutos)
      let ready = false;
      const startTime = Date.now();
      while (!ready && Date.now() - startTime < 180000) {
        setRunMessage('Aguardando servidor subir (isso pode levar 2 min)...');
        await new Promise(r => setTimeout(r, 10000)); // Espera 10s entre tentativas
        const health = await callFunction('health');
        if (health.ok) ready = true;
      }

      if (!ready) {
        setRunMessage('O servidor demorou muito para responder.');
        setRunning(false);
        return;
      }

      // 3. Dispara o robô
      setRunMessage('Servidor online! Iniciando robô...');
      const run = await callFunction('run');
      setRunMessage(run.message || 'Execução iniciada com sucesso.');
      setTimeout(() => setLivePolling(false), 900000);
    } catch (error) {
      setRunMessage(`Erro: ${error.message}`);
      setLivePolling(false);
    } finally {
      setRunning(false);
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  async function updateSchedule(newSchedule) {
    const { error } = await supabase
      .from('global_settings')
      .upsert({ key: 'schedule', value: newSchedule }, { onConflict: 'key' });
    if (!error) setSchedule(newSchedule);
  }

  async function toggleAutoShutdown() {
    const newValue = !autoShutdown;
    const { error } = await supabase
      .from('global_settings')
      .update({ value: { auto_shutdown: newValue } })
      .eq('key', 'preferences');
    if (!error) setAutoShutdown(newValue);
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
      {modalUrl && <PrintModal url={modalUrl} onClose={() => setModalUrl(null)} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-white">Dashboard</h2>
            <button onClick={checkAwsStatus} title="Verificar status AWS" className="text-gray-600 hover:text-gray-400 transition-colors">
              <RefreshCw size={14} />
            </button>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${
              awsStatus === 'online'
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : awsStatus === 'offline'
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : 'bg-gray-700 text-gray-500 border-gray-600'
            }`}>
              {awsStatus === 'online' ? <Wifi size={10} /> : <WifiOff size={10} />}
              AWS {awsStatus === 'online' ? 'Online' : awsStatus === 'offline' ? 'Offline' : '...'}
            </span>
          </div>
          {runMessage && <p className="text-sm text-gray-400 mt-1">{runMessage}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoShutdown}
            title={autoShutdown ? 'Desligar máquina ao término: Ativo' : 'Desligar máquina ao término: Inativo'}
            className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              autoShutdown
                ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20'
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700'
            }`}
          >
            <Power size={15} />
            {autoShutdown ? 'Desligar Auto' : 'Desligar Manual'}
          </button>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play size={16} />
            {running ? 'Iniciando...' : 'Rodar Agora'}
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${schedule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              <Clock size={20} />
            </div>
            <div>
              <p className="font-semibold text-white">Agendamento Automático</p>
              <p className="text-xs text-gray-500">
                {schedule.enabled 
                  ? `Ativo: O robô rodará todos os dias às ${String(schedule.hour).padStart(2, '0')}:00` 
                  : 'Desativado: O robô não rodará automaticamente'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select 
              value={schedule.hour}
              onChange={(e) => updateSchedule({ ...schedule, hour: parseInt(e.target.value) })}
              className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {[...Array(24)].map((_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
            <button
              onClick={() => updateSchedule({ ...schedule, enabled: !schedule.enabled })}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                schedule.enabled 
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20' 
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {schedule.enabled ? 'Ativo' : 'Ativar'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6 md:mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 bg-indigo-500/20 rounded-lg shrink-0">
              <Activity size={16} className="text-indigo-400 md:hidden" />
              <Activity size={20} className="text-indigo-400 hidden md:block" />
            </div>
            <div className="min-w-0">
              <p className="text-xl md:text-2xl font-bold text-white">{results.length}</p>
              <p className="hidden sm:block text-sm text-gray-500">Contas monitoradas</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 bg-green-500/20 rounded-lg shrink-0">
              <CheckCircle size={16} className="text-green-400 md:hidden" />
              <CheckCircle size={20} className="text-green-400 hidden md:block" />
            </div>
            <div className="min-w-0">
              <p className="text-xl md:text-2xl font-bold text-white">{successCount}</p>
              <p className="hidden sm:block text-sm text-gray-500">Sucesso</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 md:p-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 bg-red-500/20 rounded-lg shrink-0">
              <XCircle size={16} className="text-red-400 md:hidden" />
              <XCircle size={20} className="text-red-400 hidden md:block" />
            </div>
            <div className="min-w-0">
              <p className="text-xl md:text-2xl font-bold text-white">{errorCount}</p>
              <p className="hidden sm:block text-sm text-gray-500">Com erro</p>
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Logs */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-6">
        <button
          className="w-full px-4 md:px-5 py-4 flex items-center justify-between hover:bg-gray-800/40 transition-colors"
          onClick={() => { setLogsOpen(v => !v); if (!logsOpen && !logs) fetchLogs(); }}
        >
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-green-400" />
            <span className="font-semibold text-white">Logs da Máquina AWS</span>
          </div>
          <div className="flex items-center gap-2">
            {logsOpen && (
              <button onClick={e => { e.stopPropagation(); fetchLogs(); }}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                <RefreshCw size={12} /> Atualizar
              </button>
            )}
            {logsOpen ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
          </div>
        </button>
        {logsOpen && (
          <div className="border-t border-gray-800">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-500"></div>
              </div>
            ) : (
              <pre
                ref={logsRef}
                className="text-xs text-green-300 font-mono bg-gray-950 p-4 overflow-auto max-h-72 whitespace-pre-wrap leading-5"
              >
                {logs || '(Sem logs)'}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">Última Execução por Conta</h3>
        </div>
        {results.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Clock size={32} className="mx-auto mb-2 text-gray-300" />
            <p>Nenhuma execução registrada ainda.</p>
            <p className="text-xs mt-1">Os resultados aparecerão após o robô executar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-800/50 text-left">
              <tr>
                <th className="px-5 py-3 font-medium text-gray-400">Conta</th>
                <th className="px-5 py-3 font-medium text-gray-400">Plataforma</th>
                <th className="px-5 py-3 font-medium text-gray-400">Status</th>
                <th className="px-5 py-3 font-medium text-gray-400">Tarefas</th>
                <th className="px-5 py-3 font-medium text-gray-400">Saldo</th>
                <th className="px-5 py-3 font-medium text-gray-400">Print</th>
                <th className="px-5 py-3 font-medium text-gray-400">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {results.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/40">
                  <td className="px-5 py-3 font-medium text-gray-100">{r.account_name}</td>
                  <td className="px-5 py-3 text-gray-400">{r.platform || '-'}</td>
                  <td className="px-5 py-3">
                    {r.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                        <CheckCircle size={12} /> Sucesso
                      </span>
                    ) : r.status === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                        <XCircle size={12} /> Erro
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-400 bg-gray-500/10 border border-gray-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                        <Clock size={12} /> Sem execução
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-400">{r.tasks_completed}</td>
                  <td className="px-5 py-3 text-gray-400">{r.balance || '-'}</td>
                  <td className="px-5 py-3 text-center">
                    {r.screenshot_path || r.caminhoPrint ? (
                      <button onClick={() => setModalUrl(r.screenshot_path || r.caminhoPrint)} title="Ver print">
                        <img
                          src={r.screenshot_path || r.caminhoPrint}
                          alt="Print"
                          className="w-12 h-12 object-cover rounded shadow border border-gray-700 hover:scale-105 hover:border-indigo-500 transition-all cursor-zoom-in"
                        />
                      </button>
                    ) : (
                      <Image size={16} className="text-gray-700 mx-auto"  />
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {r.executed_at ? new Date(r.executed_at).toLocaleString('pt-BR') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

