import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle } from 'lucide-react';

export default function HistoryPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchHistory() {
    const { data, error } = await supabase
      .from('account_run_results')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setResults(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6">Histórico de Execuções</h2>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {results.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>Nenhuma execução registrada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-800/50 text-left">
              <tr>
                <th className="px-5 py-3 font-medium text-gray-400">Data/Hora</th>
                <th className="px-5 py-3 font-medium text-gray-400">Conta</th>
                <th className="px-5 py-3 font-medium text-gray-400">Plataforma</th>
                <th className="px-5 py-3 font-medium text-gray-400">Status</th>
                <th className="px-5 py-3 font-medium text-gray-400">Tarefas</th>
                <th className="px-5 py-3 font-medium text-gray-400">Saldo</th>
                <th className="px-5 py-3 font-medium text-gray-400">Print</th>
                <th className="px-5 py-3 font-medium text-gray-400">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {results.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/40">
                  <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.executed_at).toLocaleString('pt-BR')}
                  </td>
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
                  <td className="px-5 py-3 text-red-400 text-xs max-w-xs truncate">
                    {r.error_message || '-'}
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
