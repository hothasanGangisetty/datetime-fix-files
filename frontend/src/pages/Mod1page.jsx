import React, { useState } from 'react';
import axios from 'axios';
import { useConsole } from '../context/ConsoleContext';
import ConnectionBar from '../components/common/ConnectionBar';
import RunComparisonTab from '../components/common/RunComparisonTab';
import SqlQueryTab from '../components/module-1/SqlQueryTab';
import FileUploadTab from '../components/module-1/FileUploadTab';
import KeysMappingTab from '../components/module-1/KeysMappingTab';

const TABS = [
    { id: 'sql-query',      label: 'SQL Query' },
    { id: 'file-upload',    label: 'File Upload' },
    { id: 'keys-mapping',   label: 'Keys Mapping' },
    { id: 'run-comparison', label: 'Run Comparison' },
];

const Mod1page = () => {
    const { log } = useConsole();

    const [connection, setConnection] = useState(null);
    const [activeTab, setActiveTab] = useState('sql-query');
    const [sqlState, setSqlState] = useState({ query: '', columns: [], rows: [], count: 0, executed: false });
    const [fileState, setFileState] = useState({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
    const [mappingState, setMappingState] = useState({ mapping: {}, keys: [], initialized: false });

    const tabEnabled = (id) => {
        if (!connection) return false;
        if (id === 'sql-query') return true;
        if (id === 'file-upload') return sqlState.executed;
        if (id === 'keys-mapping') return sqlState.executed && fileState.uploaded;
        if (id === 'run-comparison') return sqlState.executed && fileState.uploaded && mappingState.initialized;
        return false;
    };

    const handleConnected = (conn) => { setConnection(conn); setTimeout(() => setActiveTab('sql-query'), 300); };
    const handleDisconnected = () => {
        setConnection(null); setActiveTab('sql-query');
        setSqlState({ query: '', columns: [], rows: [], count: 0, executed: false });
        setFileState({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
        setMappingState({ mapping: {}, keys: [], initialized: false });
        log('All state reset.', 'system');
    };

    const goNext = (from) => {
        const order = TABS.map(t => t.id);
        const idx = order.indexOf(from);
        if (idx >= 0 && idx < order.length - 1) setActiveTab(order[idx + 1]);
    };

    const handleReset = () => {
        setSqlState({ query: '', columns: [], rows: [], count: 0, executed: false });
        setFileState({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
        setMappingState({ mapping: {}, keys: [], initialized: false });
        setActiveTab('sql-query');
        log('───── New Comparison ─────', 'header');
        log('State cleared. Ready for a new comparison.', 'system');
    };

    const handleRunComparison = async () => {
        const column_mapping = Object.entries(mappingState.mapping)
            .filter(([, v]) => v !== '')
            .map(([sqlCol, fileCol]) => ({ sql: sqlCol, file: fileCol }));
        const payload = {
            file_id: fileState.fileId,
            file_name: fileState.fileName,
            server: connection.server,
            database: connection.database,
            port: connection.port,
            query: sqlState.query,
            column_mapping,
            keys: mappingState.keys
        };
        const res = await axios.post('/api/run_comparison', payload);
        return { result_id: res.data.result_id, summary: res.data.summary };
    };

    const renderTab = () => {
        if (!connection) return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Connect to a database to begin.</div>;
        switch (activeTab) {
            case 'sql-query':      return <SqlQueryTab connection={connection} sqlState={sqlState} setSqlState={setSqlState} onNext={() => goNext('sql-query')} />;
            case 'file-upload':    return <FileUploadTab fileState={fileState} setFileState={setFileState} onNext={() => goNext('file-upload')} />;
            case 'keys-mapping':   return <KeysMappingTab sqlState={sqlState} fileState={fileState} mappingState={mappingState} setMappingState={setMappingState} onNext={() => goNext('keys-mapping')} />;
            case 'run-comparison': return <RunComparisonTab mappingState={mappingState} onReset={handleReset} source1Label="SQL" source2Label={fileState.fileName || 'File'} onRunComparison={handleRunComparison} />;
            default: return null;
        }
    };

    return (
        <>
            <ConnectionBar connection={connection} onConnected={handleConnected} onDisconnected={handleDisconnected} />

            {/* Tab Bar */}
            <div className="bg-brand-900 border-b border-brand-700/30 flex px-2 pt-1 gap-0.5 flex-shrink-0">
                {TABS.map((tab, i) => {
                    const enabled = tabEnabled(tab.id);
                    const active = activeTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => enabled && setActiveTab(tab.id)} disabled={!enabled}
                            className={`px-4 py-2 text-xs font-bold rounded-t transition-all relative
                                ${active ? 'bg-gray-50 text-brand-900 border border-b-0 border-brand-700/30 -mb-px z-10'
                                    : enabled ? 'text-brand-100 hover:text-white hover:bg-brand-700/20'
                                    : 'text-brand-900/40 cursor-default'}`}>
                            <span className="flex items-center gap-1.5">
                                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold flex-shrink-0
                                    ${active ? 'bg-brand-700 text-white' : enabled ? 'bg-brand-500/60 text-white' : 'bg-brand-900/80 text-brand-700/50'}`}>{i + 1}</span>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-gray-50">{renderTab()}</div>
        </>
    );
};

export default Mod1page;
