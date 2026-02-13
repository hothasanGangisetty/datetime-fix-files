import React from 'react';
import { Database, FileText, ArrowLeftRight } from 'lucide-react';

const modules = [
    { id: 'sql-to-file',  label: 'SQL to File',  icon: ArrowLeftRight, enabled: true },
    { id: 'sql-to-sql',   label: 'SQL to SQL',   icon: Database,       enabled: true },
    { id: 'file-to-file', label: 'File to File',  icon: FileText,       enabled: true },
];

const Sidebar = ({ activeModule, onModuleChange }) => (
    <div className="w-48 bg-brand-900 flex flex-col border-r border-brand-900/80 flex-shrink-0">
        <div className="p-4 border-b border-white/10">
            <h1 className="text-white font-bold text-sm tracking-wide leading-tight">
                🔍 Comparison<br /><span className="text-brand-300">Tool</span>
            </h1>
        </div>
        <nav className="flex-1 py-3">
            {modules.map(mod => {
                const Icon = mod.icon;
                const isActive = activeModule === mod.id;
                return (
                    <button key={mod.id} onClick={() => mod.enabled && onModuleChange(mod.id)} disabled={!mod.enabled}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-all
                            ${isActive ? 'bg-brand-700/25 text-brand-100 border-l-3 border-brand-300 font-bold'
                                : !mod.enabled ? 'text-brand-900/40 cursor-default'
                                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-300' : !mod.enabled ? 'text-brand-900/30' : ''}`} />
                        <span>{mod.label}</span>
                    </button>
                );
            })}
        </nav>
        <div className="p-3 border-t border-white/10 text-[10px] text-brand-700/60 text-center">v2.0 &middot; QA Toolkit</div>
    </div>
);

export default Sidebar;
