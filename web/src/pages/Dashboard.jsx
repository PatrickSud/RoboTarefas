import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Clock, Activity, Play, Power } from 'lucide-react';

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');
  const [schedule, setSchedule] = useState({ enabled: false, hour: 8 });
  const [autoShutdown, setAutoShutdown] = useState(true);

  async function fetchLatestResults() {
    const [{ data: configSchedule }, { data: configPrefs }] = await Promise.all([
      supabase.from('global_settings').select('value').eq('key', 'schedule').single(),
      supabase.from('global_settings').select('value').eq('key', 'preferences').single(),
    ]);

    if (configSchedule) setSchedule(configSchedule.value);
    if (configPrefs) setAutoShutdown(configPrefs.value.auto_shutdown ?? true);

    const { data, error } = await supabase
      .from('account_run_results')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      const latestByAccount = {};
      for (const row of data) {
        if (!latestByAccount[row.account_name]) {
          latestByAccount[row.account_name] = row;
        }
      }
      setResults(Object.values(latestByAccount));
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchLatestResults();
  }, []);

  async function handleRunNow() {
    setRunning(true);
    setRunMessage('Ligando servidor AWS...');

    const callFunction = async (action) => {
      const res = await fetch('/.netlify/functions/run-robot', {
        method: 'POST',
        body: JSON.stringify({ action, autoShutdown }),
      });
      return res.json();
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
    } catch (error) {
      setRunMessage(`Erro: ${error.message}`);
    } finally {
      setRunning(false);
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  async function updateSchedule(newSchedule) {
    const { error } = await supabase
      .from('global_settings')
      .update({ value: newSchedule })
      .eq('key', 'schedule');
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white">Dashboard</h2>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Activity size={20} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{results.length}</p>
              <p className="text-sm text-gray-500">Contas monitoradas</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CheckCircle size={20} className="text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{successCount}</p>
              <p className="text-sm text-gray-500">Sucesso</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <XCircle size={20} className="text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{errorCount}</p>
              <p className="text-sm text-gray-500">Com erro</p>
            </div>
          </div>
        </div>
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
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                        <XCircle size={12} /> Erro
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-400">{r.tasks_completed}</td>
                  <td className="px-5 py-3 text-gray-400">{r.balance || '-'}</td>
                  <td className="px-5 py-3 text-center">
                    {r.screenshot_path || r.caminhoPrint ? (
                      <a href={r.screenshot_path || r.caminhoPrint} target="_blank" rel="noopener noreferrer">
                        <img
                          src={r.screenshot_path || r.caminhoPrint}
                          alt="Print"
                          className="w-12 h-12 object-cover rounded shadow border border-gray-700 hover:scale-105 transition-transform"
                        />
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.executed_at).toLocaleString('pt-BR')}
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
