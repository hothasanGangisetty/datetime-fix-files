import React, { useState } from 'react';
import { useConsole } from '../context/ConsoleContext';
import RunComparisonTab from '../components/common/RunComparisonTab';
import FileUploadTab1 from '../components/module-3/FileUploadTab1';
import FileUploadTab2 from '../components/module-3/FileUploadTab2';
import KeysMappingTab from '../components/module-3/KeysMappingTab';

const TABS = [
    { id: 'file-upload-1',  label: 'File Upload 1' },
    { id: 'file-upload-2',  label: 'File Upload 2' },
    { id: 'keys-mapping',   label: 'Keys Mapping' },
    { id: 'run-comparison', label: 'Run Comparison' },
];

const Mod3page = () => {
    const { log } = useConsole();

    const [activeTab, setActiveTab] = useState('file-upload-1');
    const [file1State, setFile1State] = useState({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
    const [file2State, setFile2State] = useState({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
    const [mappingState, setMappingState] = useState({ mapping: {}, keys: [], initialized: false });

    const tabEnabled = (id) => {
        if (id === 'file-upload-1') return true;
        if (id === 'file-upload-2') return file1State.uploaded;
        if (id === 'keys-mapping') return file1State.uploaded && file2State.uploaded;
        if (id === 'run-comparison') return file1State.uploaded && file2State.uploaded && mappingState.initialized;
        return false;
    };

    const goNext = (from) => {
        const order = TABS.map(t => t.id);
        const idx = order.indexOf(from);
        if (idx >= 0 && idx < order.length - 1) setActiveTab(order[idx + 1]);
    };

    const handleReset = () => {
        setFile1State({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
        setFile2State({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
        setMappingState({ mapping: {}, keys: [], initialized: false });
        setActiveTab('file-upload-1');
        log('───── New Comparison ─────', 'header');
        log('State cleared. Ready for a new File-to-File comparison.', 'system');
    };

    const handleRunComparison = async () => {
        throw new Error('File-to-File comparison backend is under development. Coming soon!');
    };

    const renderTab = () => {
        switch (activeTab) {
            case 'file-upload-1':  return <FileUploadTab1 fileState={file1State} setFileState={setFile1State} onNext={() => goNext('file-upload-1')} />;
            case 'file-upload-2':  return <FileUploadTab2 fileState={file2State} setFileState={setFile2State} onNext={() => goNext('file-upload-2')} />;
            case 'keys-mapping':   return <KeysMappingTab file1State={file1State} file2State={file2State} mappingState={mappingState} setMappingState={setMappingState} onNext={() => goNext('keys-mapping')} />;
            case 'run-comparison': return <RunComparisonTab mappingState={mappingState} onReset={handleReset} source1Label="File 1" source2Label="File 2" onRunComparison={handleRunComparison} />;
            default: return null;
        }
    };

    return (
        <>
            {/* Placeholder bar — same height as ConnectionBar for visual consistency */}
            <div className="bg-brand-900 px-4 py-2 flex items-center gap-3 border-b border-brand-700/30 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-brand-500/40" />
                <span className="text-brand-300/60 text-xs">File-to-File Mode — No database connection required</span>
            </div>

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

export default Mod3page;
