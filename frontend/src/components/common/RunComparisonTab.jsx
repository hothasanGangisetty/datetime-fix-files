import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useConsole } from '../../context/ConsoleContext';
import {
    Play, Download, RotateCcw, ChevronDown, ChevronUp,
    AlertTriangle, MinusCircle, PlusCircle, CheckCircle2
} from 'lucide-react';

/**
 * Generic RunComparisonTab — shared across all modules.
 *
 * Props:
 *   mappingState   — { mapping: {}, keys: [], initialized: bool }
 *   onReset        — () => void  (reset state for new comparison)
 *   source1Label   — string (e.g. "SQL", "SQL 1", "File 1")
 *   source2Label   — string (e.g. "File", "SQL 2", "File 2")
 *   onRunComparison — async () => { result_id, summary }
 */
const RunComparisonTab = ({
    mappingState,
    onReset,
    source1Label = 'SQL',
    source2Label = 'File',
    onRunComparison,
}) => {
    const { log } = useConsole();

    const [resultId, setResultId] = useState(null);
    const [summary, setSummary] = useState(null);
    const [allData, setAllData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);
    const [collapsed, setCollapsed] = useState({ mismatch: false, missing: false, extra: false });

    const mappedPairs = Object.entries(mappingState.mapping).filter(([, v]) => v !== '');

    // ── Run Comparison ──
    const handleRun = async () => {
        setLoading(true);
        log('───── Running Comparison ─────', 'header');
        log(`Mapped columns: ${mappedPairs.length}`, 'info');
        log(`Key columns: ${mappingState.keys.length > 0 ? mappingState.keys.join(', ') : 'None (Smart Fingerprint)'}`, 'info');

        try {
            const { result_id, summary: sum } = await onRunComparison();
            setResultId(result_id);
            setSummary(sum);

            const s1Rows = sum.total_sql_rows ?? sum.total_source1_rows ?? 0;
            const s2Rows = sum.total_file_rows ?? sum.total_source2_rows ?? 0;

            log(`Comparison complete!  [${sum.comparison_mode} mode, ${sum.elapsed_seconds}s]`, 'success');
            log(`${source1Label} Rows: ${s1Rows}  |  ${source2Label} Rows: ${s2Rows}  |  Matched: ${sum.matched_rows}`, 'info');
            log(`Mismatched: ${sum.mismatches}  |  ${source1Label} Only: ${sum.only_on_sql ?? 0}  |  ${source2Label} Only: ${sum.only_on_file ?? 0}`,
                (sum.mismatches + (sum.only_on_sql ?? 0) + (sum.only_on_file ?? 0)) > 0 ? 'warn' : 'success');

            if (sum.pairing_skipped) log('⚠ Unmatched set too large for similarity pairing. Select key columns for best accuracy.', 'warn');
            if (sum.mismatches + (sum.only_on_sql ?? 0) + (sum.only_on_file ?? 0) === 0) log('✅ No discrepancies — data matches perfectly!', 'success');
        } catch (err) {
            const msg = err.response?.data?.message || err.message || String(err);
            log(`Comparison failed: ${msg}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // ── Load full result pages ──
    useEffect(() => {
        if (!resultId) return;
        const loadAll = async () => {
            setLoadingResults(true);
            try {
                let collected = [], pg = 1, hasMore = true;
                while (hasMore) {
                    const res = await axios.get(`/api/results_page?result_id=${resultId}&page=${pg}&size=5000`);
                    collected = [...collected, ...res.data.data];
                    hasMore = res.data.has_more;
                    pg++;
                }
                setAllData(collected);
                if (collected.length > 0) {
                    setColumns(Object.keys(collected[0]).filter(k => !['status', '_mismatch_cols'].includes(k)));
                }
                if (collected.length > 0) log(`Loaded ${collected.length} result rows for display`, 'info');
            } catch { log('Failed to load result rows', 'error'); }
            finally { setLoadingResults(false); }
        };
        loadAll();
    }, [resultId]);

    // ── Detect source column ──
    const sourceCol = columns.find(c => c === 'source' || c === 'pre/post');
    const allSourceValues = sourceCol ? [...new Set(allData.map(r => r[sourceCol]).filter(Boolean))] : [];
    const source1Value = allSourceValues[0];

    // ── Categories ──
    const mismatched = allData.filter(r => r.status === 'Mismatch');
    const missing = allData.filter(r => r.status === 'Only in SQL' || r.status === `Only in ${source1Label}`);
    const extra = allData.filter(r => r.status === 'Only in File' || r.status === `Only in ${source2Label}`);

    const isMismatchCell = (row, col) => row.status === 'Mismatch' && (row._mismatch_cols || '').split(',').filter(Boolean).includes(col);

    // ── Export ──
    const handleExportExcel = () => {
        const a = document.createElement('a'); a.href = `/api/export_excel?result_id=${resultId}`; a.download = ''; a.click();
        log('Downloading styled Excel report...', 'success');
    };
    const handleExportCsv = () => {
        if (allData.length === 0) return;
        const headers = Object.keys(allData[0]).filter(k => k !== '_mismatch_cols');
        const csvRows = [headers.join(',')];
        allData.forEach(row => csvRows.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')));
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `reconciliation_${resultId?.slice(0, 8) || 'result'}.csv`; a.click();
        URL.revokeObjectURL(url);
        log(`Exported ${allData.length} rows to CSV`, 'success');
    };

    const toggle = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

    // ── Render table ──
    const renderTable = (rows, rowBgFn) => {
        if (rows.length === 0) return <p className="text-xs text-gray-400 italic px-3 py-2">None</p>;
        return (
            <div className="overflow-x-auto">
                <table className="min-w-full text-[11px] text-left whitespace-nowrap">
                    <thead className="bg-brand-900 text-white sticky top-0 z-10 font-bold">
                        <tr>{columns.map(col => <th key={col} className={`px-2 py-1.5 border-r border-slate-600 ${col === sourceCol ? 'w-24' : ''}`}>{col}</th>)}</tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => {
                            const isS1 = sourceCol && row[sourceCol] === source1Value;
                            const isPairStart = isS1 || row.status !== 'Mismatch';
                            return (
                                <tr key={idx} className={`${rowBgFn(row)} ${isPairStart && idx > 0 ? 'border-t-2 border-slate-300' : 'border-t border-gray-100'} hover:brightness-95 transition-all`}>
                                    {columns.map(col => {
                                        const mismatch = isMismatchCell(row, col);
                                        const isSrcCol = col === sourceCol;
                                        let cls = 'px-2 py-1 border-r';
                                        if (isSrcCol) cls += isS1 ? ' font-bold text-blue-700' : ' font-bold text-emerald-700';
                                        else if (mismatch) cls += ' bg-red-200 text-red-900 font-bold';
                                        return <td key={col} className={cls}>{String(row[col] ?? '')}</td>;
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    // ── Section header ──
    const SectionHeader = ({ title, icon, count, color, sectionKey, badgeBg }) => (
        <button onClick={() => toggle(sectionKey)}
            className={`w-full flex items-center justify-between px-3 py-2 ${color} rounded-t font-bold text-xs hover:brightness-95 transition-all`}>
            <div className="flex items-center gap-2">{icon}<span>{title}</span><span className={`${badgeBg} text-white text-[10px] px-1.5 py-0.5 rounded-full`}>{count}</span></div>
            {collapsed[sectionKey] ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
    );

    // ── PRE-RUN ──
    if (!resultId) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-6 p-6">
                <div className="text-center max-w-md">
                    <Play className="w-12 h-12 text-brand-700 mx-auto mb-3" />
                    <h3 className="font-bold text-lg text-slate-700 mb-1">Ready to Compare</h3>
                    <p className="text-sm text-gray-500 mb-4">
                        {mappedPairs.length} columns mapped
                        {mappingState.keys.length > 0 ? `, ${mappingState.keys.length} key(s) selected` : ' (Smart Fingerprint mode)'}
                    </p>
                    <button onClick={handleRun} disabled={loading}
                        className="bg-brand-700 hover:bg-brand-900 disabled:bg-gray-300 text-white px-8 py-3 rounded-lg font-bold text-sm shadow-lg flex items-center gap-2 mx-auto transition-colors">
                        <Play className="w-4 h-4" /> {loading ? 'Processing...' : 'Run Comparison'}
                    </button>
                </div>
            </div>
        );
    }

    // ── LOADING ──
    if (loadingResults) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin w-10 h-10 border-4 border-brand-700 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-gray-500 text-sm font-medium">Loading results...</p>
                </div>
            </div>
        );
    }

    // ── RESULTS ──
    const s1Rows = summary.total_sql_rows ?? summary.total_source1_rows ?? 0;
    const s2Rows = summary.total_file_rows ?? summary.total_source2_rows ?? 0;
    const s1Only = summary.only_on_sql ?? 0;
    const s2Only = summary.only_on_file ?? 0;

    return (
        <div className="p-4 space-y-3 overflow-auto">
            {/* Mode + Timing */}
            <div className="flex items-center justify-between text-[10px] px-1 mb-1">
                <span className="font-bold text-brand-900 bg-brand-100/60 px-2 py-0.5 rounded">{summary.comparison_mode} Mode</span>
                {summary.pairing_skipped && <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">⚠ Pairing skipped</span>}
                <span className="text-gray-400">{summary.elapsed_seconds}s</span>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-6 gap-2 text-center">
                <div className="p-2 bg-brand-100/30 rounded border border-brand-700/20">
                    <div className="text-[10px] text-brand-900 uppercase font-bold">{source1Label} Rows</div>
                    <div className="text-lg font-bold text-brand-900">{s1Rows}</div>
                </div>
                <div className="p-2 bg-brand-100/50 rounded border border-brand-500/20">
                    <div className="text-[10px] text-brand-700 uppercase font-bold">{source2Label} Rows</div>
                    <div className="text-lg font-bold text-brand-900">{s2Rows}</div>
                </div>
                <div className="p-2 bg-brand-100/30 rounded border border-brand-300/40">
                    <div className="text-[10px] text-brand-700 uppercase font-bold">Matched</div>
                    <div className="text-lg font-bold text-brand-700">{summary.matched_rows}</div>
                </div>
                <div className="p-2 bg-orange-50 rounded border border-orange-200">
                    <div className="text-[10px] text-orange-600 uppercase font-bold">Mismatched</div>
                    <div className="text-lg font-bold text-orange-700">{summary.mismatches}</div>
                </div>
                <div className="p-2 bg-amber-50 rounded border border-amber-200">
                    <div className="text-[10px] text-amber-600 uppercase font-bold">{source1Label} Only</div>
                    <div className="text-lg font-bold text-amber-700">{s1Only}</div>
                </div>
                <div className="p-2 bg-red-50 rounded border border-red-200">
                    <div className="text-[10px] text-red-600 uppercase font-bold">{source2Label} Only</div>
                    <div className="text-lg font-bold text-red-700">{s2Only}</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-200 border border-yellow-400 inline-block" /> {source1Label}</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-200 border border-green-400 inline-block" /> {source2Label}</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-300 border border-red-400 inline-block" /> Changed</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExportExcel} className="px-3 py-1 bg-brand-500 text-white rounded hover:bg-brand-700 flex items-center gap-1 text-xs font-bold"><Download className="w-3 h-3" /> Export Excel</button>
                    <button onClick={handleExportCsv} className="px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-700 flex items-center gap-1 text-xs"><Download className="w-3 h-3" /> CSV</button>
                    <button onClick={onReset} className="px-3 py-1 bg-brand-700 text-white rounded hover:bg-brand-900 flex items-center gap-1 text-xs"><RotateCcw className="w-3 h-3" /> New</button>
                </div>
            </div>

            {/* Perfect match */}
            {allData.length === 0 && (
                <div className="bg-brand-100/30 border border-brand-500/30 rounded-lg p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-brand-500 mx-auto mb-2" />
                    <p className="text-brand-900 font-bold text-sm">No discrepancies — all {summary.matched_rows} rows match perfectly!</p>
                </div>
            )}

            {/* Mismatched */}
            {mismatched.length > 0 && (
                <div className="bg-white rounded-lg shadow border border-orange-200">
                    <SectionHeader title="Mismatched Rows" icon={<AlertTriangle className="w-3 h-3 text-orange-700" />}
                        count={summary.mismatches} color="bg-orange-50 text-orange-800" sectionKey="mismatch" badgeBg="bg-orange-500" />
                    {!collapsed.mismatch && renderTable(mismatched, row => sourceCol && row[sourceCol] === source1Value ? 'bg-yellow-50' : 'bg-green-50')}
                </div>
            )}

            {/* Source1 Only */}
            {missing.length > 0 && (
                <div className="bg-white rounded-lg shadow border border-amber-200">
                    <SectionHeader title={`Only in ${source1Label}`} icon={<MinusCircle className="w-3 h-3 text-amber-700" />}
                        count={s1Only} color="bg-amber-50 text-amber-800" sectionKey="missing" badgeBg="bg-amber-500" />
                    {!collapsed.missing && renderTable(missing, () => 'bg-amber-50')}
                </div>
            )}

            {/* Source2 Only */}
            {extra.length > 0 && (
                <div className="bg-white rounded-lg shadow border border-red-200">
                    <SectionHeader title={`Only in ${source2Label}`} icon={<PlusCircle className="w-3 h-3 text-red-700" />}
                        count={s2Only} color="bg-red-50 text-red-800" sectionKey="extra" badgeBg="bg-red-500" />
                    {!collapsed.extra && renderTable(extra, () => 'bg-red-50')}
                </div>
            )}
        </div>
    );
};

export default RunComparisonTab;
