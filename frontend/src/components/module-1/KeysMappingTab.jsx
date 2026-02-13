import React, { useEffect, useMemo } from 'react';
import { useConsole } from '../../context/ConsoleContext';
import { ArrowRight, Key, Check, AlertTriangle, ArrowLeftRight } from 'lucide-react';

const KeysMappingTab = ({ sqlState, fileState, mappingState, setMappingState, onNext }) => {
    const { log } = useConsole();

    useEffect(() => {
        if (mappingState.initialized) return;
        const initial = {};
        sqlState.columns.forEach(sqlCol => {
            const match = fileState.columns.find(fc => fc.toLowerCase() === sqlCol.toLowerCase());
            initial[sqlCol] = match || '';
        });
        setMappingState({ mapping: initial, keys: [], initialized: true });
        log(`Auto-mapped ${Object.values(initial).filter(Boolean).length} / ${sqlState.columns.length} columns by name match`, 'info');
    }, [sqlState.columns, fileState.columns]);

    const mapping = mappingState.mapping;
    const selectedKeys = mappingState.keys;
    const setMapping = (m) => setMappingState(prev => ({ ...prev, mapping: m }));
    const setSelectedKeys = (k) => setMappingState(prev => ({ ...prev, keys: k }));

    const handleMappingChange = (sqlCol, fileCol) => {
        const next = { ...mapping, [sqlCol]: fileCol };
        setMapping(next);
        if (!fileCol && selectedKeys.includes(sqlCol)) setSelectedKeys(selectedKeys.filter(k => k !== sqlCol));
        if (fileCol) log(`Mapped: ${sqlCol} → ${fileCol}`, 'info'); else log(`Unmapped: ${sqlCol}`, 'warn');
    };

    const toggleKey = (sqlCol) => {
        if (!mapping[sqlCol]) return;
        if (selectedKeys.includes(sqlCol)) { setSelectedKeys(selectedKeys.filter(k => k !== sqlCol)); log(`Removed key: ${sqlCol}`, 'warn'); }
        else { setSelectedKeys([...selectedKeys, sqlCol]); log(`Added key: ${sqlCol}`, 'success'); }
    };

    const mappedPairs = useMemo(() => Object.entries(mapping).filter(([, v]) => v !== ''), [mapping]);
    const unmappedCount = sqlState.columns.length - mappedPairs.length;
    const usedFileColumns = useMemo(() => Object.values(mapping).filter(Boolean), [mapping]);

    const handleNext = () => {
        log('───── Mapping Summary ─────', 'header');
        log(`${mappedPairs.length} columns mapped, ${unmappedCount} skipped`, 'info');
        if (selectedKeys.length > 0) log(`Key columns: ${selectedKeys.join(', ')}`, 'success');
        else log('No keys selected → sequential row-by-row comparison', 'warn');
        onNext();
    };

    return (
        <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
            <div className="flex items-center gap-2 text-slate-700">
                <ArrowLeftRight className="w-5 h-5 text-brand-700" />
                <h3 className="font-bold text-sm">Column Mapping &amp; Key Selection</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1 px-2 py-1 bg-brand-100/40 border border-brand-500/30 rounded text-brand-900"><Check className="w-3 h-3" /> <strong>{mappedPairs.length}</strong> mapped</span>
                {unmappedCount > 0 && <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700"><AlertTriangle className="w-3 h-3" /> <strong>{unmappedCount}</strong> skipped</span>}
                <span className="flex items-center gap-1 px-2 py-1 bg-brand-100/30 border border-brand-700/30 rounded text-brand-900"><Key className="w-3 h-3" /> <strong>{selectedKeys.length}</strong> key{selectedKeys.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex-1 overflow-auto border rounded-lg">
                <table className="w-full text-xs">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left w-10">🔑</th>
                            <th className="px-3 py-2 text-left text-brand-900 font-bold">SQL Column</th>
                            <th className="px-3 py-2 text-center w-8"><ArrowRight className="w-3 h-3 mx-auto text-gray-400" /></th>
                            <th className="px-3 py-2 text-left text-brand-500 font-bold">File Column</th>
                            <th className="px-3 py-2 text-center w-16">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sqlState.columns.map(sqlCol => {
                            const isMapped = mapping[sqlCol] && mapping[sqlCol] !== '';
                            const isKey = selectedKeys.includes(sqlCol);
                            return (
                                <tr key={sqlCol} className={`${isMapped ? 'bg-white' : 'bg-amber-50/50'} hover:bg-slate-50 transition-colors`}>
                                    <td className="px-3 py-2 text-center">
                                        <button onClick={() => toggleKey(sqlCol)} disabled={!isMapped}
                                            className={`w-6 h-6 rounded border-2 flex items-center justify-center text-[10px] transition-all
                                                ${isKey ? 'bg-brand-700 border-brand-900 text-white shadow' : isMapped ? 'border-gray-300 hover:border-brand-700 text-transparent hover:text-brand-500' : 'border-gray-200 text-transparent cursor-not-allowed'}`}>
                                            <Key className="w-3 h-3" />
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 font-mono font-bold text-brand-900">{sqlCol}</td>
                                    <td className="px-3 py-2 text-center"><ArrowRight className={`w-3 h-3 mx-auto ${isMapped ? 'text-brand-500' : 'text-gray-300'}`} /></td>
                                    <td className="px-3 py-2">
                                        <select value={mapping[sqlCol] || ''} onChange={e => handleMappingChange(sqlCol, e.target.value)}
                                            className={`w-full p-1.5 border rounded text-xs font-mono ${isMapped ? 'border-brand-500/40 bg-brand-100/20 text-brand-900' : 'border-amber-300 bg-white text-gray-600'}`}>
                                            <option value="">-- Not Mapped --</option>
                                            {fileState.columns.map(fc => <option key={fc} value={fc} disabled={usedFileColumns.includes(fc) && mapping[sqlCol] !== fc}>{fc}{usedFileColumns.includes(fc) && mapping[sqlCol] !== fc ? ' (used)' : ''}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {isMapped ? <span className="text-brand-700 text-[10px] font-bold flex items-center justify-center gap-0.5"><Check className="w-3 h-3" />Mapped</span>
                                            : <span className="text-amber-500 text-[10px] font-bold">Skip</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {selectedKeys.length === 0 && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span><strong>Sequential mode</strong> — No keys selected. Rows compared by position.</span>
                </div>
            )}
            <div className="flex justify-end">
                <button onClick={handleNext} disabled={mappedPairs.length === 0}
                    className="bg-brand-500 hover:bg-brand-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">Next →</button>
            </div>
        </div>
    );
};

export default KeysMappingTab;
