import React, { useEffect, useRef, useState } from 'react';
import { useConsole } from '../../context/ConsoleContext';
import { Trash2 } from 'lucide-react';

const ConsolePanel = () => {
    const { logs, log, clear } = useConsole();
    const bottomRef = useRef(null);
    const [cmdInput, setCmdInput] = useState('');

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

    const handleCmd = (e) => {
        if (e.key !== 'Enter') return;
        const cmd = cmdInput.trim().toLowerCase();
        if (cmd === 'clear' || cmd === 'cls') clear();
        else if (cmd) log(`Unknown command: ${cmd}`, 'warn');
        setCmdInput('');
    };

    const colorMap = {
        info: 'text-gray-300', success: 'text-brand-300', error: 'text-red-400',
        warn: 'text-yellow-400', header: 'text-brand-500 font-bold', system: 'text-brand-700 italic',
    };

    const renderLog = (entry) => {
        if (entry.type === 'table') {
            const { columns, rows, total, shown, hasEllipsis, lastRow } = entry.message;
            return (
                <div className="ml-20 my-1">
                    <table className="border-collapse text-xs">
                        <thead><tr>
                            {columns.map((col, i) => <th key={i} className="border border-gray-600 px-2 py-0.5 text-brand-300 text-left bg-gray-800">{col}</th>)}
                        </tr></thead>
                        <tbody>
                            {rows.map((row, ri) => <tr key={ri}>{columns.map((col, ci) => <td key={ci} className="border border-gray-700 px-2 py-0.5 text-gray-300">{String(row[col] ?? '')}</td>)}</tr>)}
                            {hasEllipsis && <tr><td colSpan={columns.length} className="border border-gray-700 px-2 py-1 text-gray-500 text-center italic">··· {total - shown - (lastRow ? 1 : 0)} more rows ···</td></tr>}
                            {lastRow && <tr>{columns.map((col, ci) => <td key={ci} className="border border-gray-700 px-2 py-0.5 text-gray-300">{String(lastRow[col] ?? '')}</td>)}</tr>}
                        </tbody>
                    </table>
                </div>
            );
        }
        return (
            <div className="flex leading-relaxed">
                <span className="text-gray-500 w-20 flex-shrink-0 select-none">[{entry.time}]</span>
                <span className={colorMap[entry.type] || 'text-gray-300'}>
                    {entry.type === 'success' && '✓ '}{entry.type === 'error' && '✗ '}{entry.type === 'warn' && '⚠ '}{entry.message}
                </span>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-[#1e1e1e] font-mono text-xs select-text">
            <div className="flex items-center justify-between px-3 py-1 bg-[#2d2d2d] border-b border-gray-700 flex-shrink-0">
                <span className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">Console Output</span>
                <button onClick={clear} className="text-gray-500 hover:text-gray-300 transition-colors p-0.5" title="Clear Console"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-auto p-3 space-y-0.5 console-scrollbar">
                {logs.length === 0 && <div className="text-gray-600 italic"><span className="text-brand-500">C:\Reconcile&gt;</span> Waiting for actions...</div>}
                {logs.map(entry => <div key={entry.id}>{renderLog(entry)}</div>)}
                <div ref={bottomRef} />
            </div>
            <div className="px-3 py-1 border-t border-gray-800 flex items-center gap-1 flex-shrink-0">
                <span className="text-brand-500">C:\Reconcile&gt;</span>
                <input type="text" value={cmdInput} onChange={e => setCmdInput(e.target.value)} onKeyDown={handleCmd}
                    placeholder="type 'clear' to clear console" className="flex-1 bg-transparent text-gray-300 text-xs outline-none font-mono placeholder-gray-700" spellCheck={false} />
            </div>
        </div>
    );
};

export default ConsolePanel;
