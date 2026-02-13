import React, { useState } from 'react';
import { useConsole } from '../context/ConsoleContext';
import ConnectionBar from '../components/common/ConnectionBar';
import RunComparisonTab from '../components/common/RunComparisonTab';
import SqlQueryTab1 from '../components/module-2/SqlQueryTab1';
import SqlQueryTab2 from '../components/module-2/SqlQueryTab2';
import KeysMappingTab from '../components/module-2/KeysMappingTab';

const TABS = [
    { id: 'sql-query-1',    label: 'SQL Query 1' },
    { id: 'sql-query-2',    label: 'SQL Query 2' },
    { id: 'keys-mapping',   label: 'Keys Mapping' },
    { id: 'run-comparison', label: 'Run Comparison' },
];

const Mod2page = () => {
    const { log } = useConsole();

    const [connection1, setConnection1] = useState(null);
    const [connection2, setConnection2] = useState(null);
    const [activeTab, setActiveTab] = useState('sql-query-1');
    const [sql1State, setSql1State] = useState({ query: '', columns: [], rows: [], count: 0, executed: false });
    const [sql2State, setSql2State] = useState({ query: '', columns: [], rows: [], count: 0, executed: false });
    const [mappingState, setMappingState] = useState({ mapping: {}, keys: [], initialized: false });

    const tabEnabled = (id) => {
        if (id === 'sql-query-1') return !!connection1;
        if (id === 'sql-query-2') return sql1State.executed && !!connection2;
        if (id === 'keys-mapping') return sql1State.executed && sql2State.executed;
        if (id === 'run-comparison') return sql1State.executed && sql2State.executed && mappingState.initialized;
        return false;
    };

    const handleConnected1 = (conn) => { setConnection1(conn); setTimeout(() => setActiveTab('sql-query-1'), 300); };
    const handleDisconnected1 = () => {
        setConnection1(null); setActiveTab('sql-query-1');
        setSql1State({ query: '', columns: [], rows: [], count: 0, executed: false });
        setSql2State({ query: '', columns: [], rows: [], count: 0, executed: false });
        setMappingState({ mapping: {}, keys: [], initialized: false });
        log('[SQL 1] Disconnected. State reset.', 'system');
    };
    const handleConnected2 = (conn) => { setConnection2(conn); };
    const handleDisconnected2 = () => {
        setConnection2(null);
        setSql2State({ query: '', columns: [], rows: [], count: 0, executed: false });
        setMappingState({ mapping: {}, keys: [], initialized: false });
        log('[SQL 2] Disconnected. State reset.', 'system');
    };

    const goNext = (from) => {
        const order = TABS.map(t => t.id);
        const idx = order.indexOf(from);
        if (idx >= 0 && idx < order.length - 1) setActiveTab(order[idx + 1]);
    };

    const handleReset = () => {
        setSql1State({ query: '', columns: [], rows: [], count: 0, executed: false });
        setSql2State({ query: '', columns: [], rows: [], count: 0, executed: false });
        setMappingState({ mapping: {}, keys: [], initialized: false });
        setActiveTab('sql-query-1');
        log('───── New Comparison ─────', 'header');
        log('State cleared. Ready for a new SQL-to-SQL comparison.', 'system');
    };

    const handleRunComparison = async () => {
        throw new Error('SQL-to-SQL comparison backend is under development. Coming soon!');
    };

    const renderTab = () => {
        switch (activeTab) {
            case 'sql-query-1':    return connection1 ? <SqlQueryTab1 connection={connection1} sqlState={sql1State} setSqlState={setSql1State} onNext={() => goNext('sql-query-1')} /> : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Connect SQL Source 1 to begin.</div>;
            case 'sql-query-2':    return connection2 ? <SqlQueryTab2 connection={connection2} sqlState={sql2State} setSqlState={setSql2State} onNext={() => goNext('sql-query-2')} /> : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Connect SQL Source 2 to continue.</div>;
            case 'keys-mapping':   return <KeysMappingTab sql1State={sql1State} sql2State={sql2State} mappingState={mappingState} setMappingState={setMappingState} onNext={() => goNext('keys-mapping')} />;
            case 'run-comparison': return <RunComparisonTab mappingState={mappingState} onReset={handleReset} source1Label="SQL 1" source2Label="SQL 2" onRunComparison={handleRunComparison} />;
            default: return null;
        }
    };

    return (
        <>
            {/* Two Connection Bars */}
            <ConnectionBar connection={connection1} onConnected={handleConnected1} onDisconnected={handleDisconnected1} label="SQL 1" />
            <ConnectionBar connection={connection2} onConnected={handleConnected2} onDisconnected={handleDisconnected2} label="SQL 2" />

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

export default Mod2page;
