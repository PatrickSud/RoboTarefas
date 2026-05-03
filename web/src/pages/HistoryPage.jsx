import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Search, X, Image } from 'lucide-react';

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

export default function HistoryPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [modalUrl, setModalUrl] = useState(null);

  async function fetchHistory() {
    const { data, error } = await supabase
      .from('account_run_results')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(300);
    if (!error && data) setResults(data);
    setLoading(false);
  }

  useEffect(() => { fetchHistory(); }, []);

  const platforms = useMemo(() => [...new Set(results.map(r => r.platform).filter(Boolean))], [results]);

  const filtered = useMemo(() => {
    let list = results;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.account_name?.toLowerCase().includes(q) || r.platform?.toLowerCase().includes(q));
    }
    if (filterPlatform) list = list.filter(r => r.platform === filterPlatform);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    if (filterDateFrom) list = list.filter(r => new Date(r.executed_at) >= new Date(filterDateFrom));
    if (filterDateTo) {
      const to = new Date(filterDateTo); to.setHours(23, 59, 59);
      list = list.filter(r => new Date(r.executed_at) <= to);
    }
    return list;
  }, [results, search, filterPlatform, filterStatus, filterDateFrom, filterDateTo]);

  const isFiltering = search || filterPlatform || filterStatus || filterDateFrom || filterDateTo;

  function clearFilters() {
    setSearch(''); setFilterPlatform(''); setFilterStatus('');
    setFilterDateFrom(''); setFilterDateTo('');
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

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-white">Histórico de Execuções</h2>
        {isFiltering && (
          <button onClick={clearFilters} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <X size={12} /> Limpar filtros
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <div className="relative lg:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input type="text" placeholder="Buscar conta ou plataforma..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600" />
        </div>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
          className="py-2 px-3 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todas plataformas</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="py-2 px-3 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos os status</option>
          <option value="success">Sucesso</option>
          <option value="error">Erro</option>
        </select>
        <div className="flex gap-2">
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="flex-1 py-2 px-2 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="flex-1 py-2 px-2 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>{isFiltering ? 'Nenhum resultado para os filtros aplicados.' : 'Nenhuma execução registrada ainda.'}</p>
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
                {filtered.map((r) => {
                  const printUrl = r.screenshot_path || r.caminhoPrint;
                  return (
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
                      <td className="px-5 py-3 text-gray-400">{r.tasks_completed ?? '-'}</td>
                      <td className="px-5 py-3 text-gray-400">{r.balance || '-'}</td>
                      <td className="px-5 py-3 text-center">
                        {printUrl ? (
                          <button onClick={() => setModalUrl(printUrl)} title="Ver print">
                            <img src={printUrl} alt="Print"
                              className="w-12 h-12 object-cover rounded shadow border border-gray-700 hover:scale-105 hover:border-indigo-500 transition-all cursor-zoom-in" />
                          </button>
                        ) : (
                          <Image size={16} className="text-gray-700 mx-auto" />
                        )}
                      </td>
                      <td className="px-5 py-3 text-red-400 text-xs max-w-xs truncate">
                        {r.error_message || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-600 mt-2 text-right">{filtered.length} registro(s)</p>
    </div>
  );
}
