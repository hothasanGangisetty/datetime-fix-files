import React, { useState } from 'react';
import axios from 'axios';
import { useConsole } from '../../context/ConsoleContext';
import { Play, Database } from 'lucide-react';

const SqlQueryTab2 = ({ connection, sqlState, setSqlState, onNext }) => {
    const { log, logTable } = useConsole();
    const [loading, setLoading] = useState(false);

    const handleExecute = async () => {
        if (!sqlState.query.trim()) return;
        setLoading(true);
        log(`[SQL 2] Executing query on ${connection.database}...`, 'info');
        log(sqlState.query.trim(), 'header');
        try {
            const res = await axios.post('/api/preview_sql', {
                server: connection.server, database: connection.database,
                port: connection.port, query: sqlState.query
            });
            const { columns, preview_data, row_count_estimate } = res.data;
            setSqlState(prev => ({ ...prev, columns: columns || [], rows: preview_data || [], count: row_count_estimate || 0, executed: true }));
            log(`[SQL 2] Query executed — ${row_count_estimate} rows fetched`, 'success');
            log(`Columns: ${(columns || []).join(', ')}`, 'info');
            logTable(columns || [], preview_data || [], 5, { lastRow: res.data.last_row, totalRows: row_count_estimate });
            log('→ Click Next to proceed to Keys Mapping', 'system');
        } catch (err) {
            log(`[SQL 2] Query failed: ${err.response?.data?.message || err.message}`, 'error');
            setSqlState(prev => ({ ...prev, executed: false }));
        } finally { setLoading(false); }
    };

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            <div className="flex items-center gap-2 text-slate-700">
                <Database className="w-5 h-5 text-brand-500" />
                <h3 className="font-bold text-sm">SQL Query — Source 2</h3>
                {sqlState.executed && <span className="ml-auto text-xs bg-brand-100 text-brand-900 px-2 py-0.5 rounded font-bold">✓ {sqlState.count} rows</span>}
            </div>
            <textarea className="flex-1 w-full p-3 border border-gray-300 rounded-lg font-mono text-sm bg-slate-50 focus:border-brand-700 focus:ring-1 focus:ring-brand-700 outline-none resize-none min-h-[120px]"
                value={sqlState.query} onChange={e => setSqlState(prev => ({ ...prev, query: e.target.value, executed: false }))}
                placeholder="SELECT * FROM SourceTable2" spellCheck={false} />
            <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">{sqlState.executed ? `${sqlState.columns.length} columns, ~${sqlState.count} rows` : 'Write a SELECT query for Source 2'}</span>
                <div className="flex gap-2">
                    <button onClick={handleExecute} disabled={loading || !sqlState.query.trim()}
                        className="bg-brand-700 hover:bg-brand-900 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                        <Play className="w-4 h-4" /> {loading ? 'Executing...' : 'Execute'}
                    </button>
                    <button onClick={onNext} disabled={!sqlState.executed}
                        className="bg-brand-500 hover:bg-brand-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">Next →</button>
                </div>
            </div>
        </div>
    );
};

export default SqlQueryTab2;
