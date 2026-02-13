import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useConsole } from '../../context/ConsoleContext';
import { Plug, Unplug, ShieldCheck, ShieldAlert } from 'lucide-react';

const ConnectionBar = ({ connection, onConnected, onDisconnected, label = '' }) => {
    const { log } = useConsole();
    const [config, setConfig] = useState({ environments: [], auth_type: 'windows' });
    const [selectedEnv, setSelectedEnv] = useState('');
    const [selectedServerLabel, setSelectedServerLabel] = useState('');
    const [selectedDB, setSelectedDB] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const heartbeatRef = useRef(null);

    useEffect(() => {
        axios.get('/api/config')
            .then(res => {
                setConfig(res.data);
                log(`${label ? label + ': ' : ''}Configuration loaded. Select an environment to begin.`, 'system');
            })
            .catch(() => log(`${label ? label + ': ' : ''}Failed to load config. Is the backend running on port 5000?`, 'error'));
    }, []);

    useEffect(() => {
        if (!connection) {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            return;
        }
        heartbeatRef.current = setInterval(async () => {
            try {
                const res = await axios.get('/api/heartbeat');
                if (res.data.timed_out) {
                    log(`⏱ Session timed out. Disconnecting${label ? ' ' + label : ''}...`, 'warn');
                    doDisconnect(true);
                }
            } catch { /* server down */ }
        }, 30000);
        return () => clearInterval(heartbeatRef.current);
    }, [connection]);

    useEffect(() => {
        const handler = () => {
            if (connection) navigator.sendBeacon('/api/disconnect', '{}');
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [connection]);

    const activeEnv = config.environments?.find(e => e.env_name === selectedEnv);
    const serverList = activeEnv ? activeEnv.instances : [];
    const activeServer = serverList.find(s => s.server_label === selectedServerLabel);
    const dbList = activeServer ? activeServer.databases : [];
    const serverPort = activeServer ? activeServer.port : null;

    const globalAuthType = config.auth_type || 'windows';
    const instanceHasCreds = activeServer && (activeServer.username !== undefined || activeServer.password !== undefined);
    const isSqlAuth = instanceHasCreds ? true : (globalAuthType === 'sql');

    useEffect(() => { setUsername(''); setPassword(''); }, [selectedServerLabel, selectedEnv]);

    const handleConnect = async () => {
        if (!activeServer || !selectedDB) return;
        setLoading(true);
        log(`${label ? label + ': ' : ''}Connecting to ${activeServer.host} / ${selectedDB} ...`, 'info');
        try {
            const payload = { server: activeServer.host, database: selectedDB, port: serverPort };
            if (username || password || isSqlAuth) { payload.username = username; payload.password = password; }
            const res = await axios.post('/api/connect', payload);
            log(`${label ? label + ': ' : ''}Connected to ${activeServer.host} / ${selectedDB} — ${res.data.message}`, 'success');
            log(`Auth: ${res.data.info}`, 'system');
            onConnected({ server: activeServer.host, database: selectedDB, env: selectedEnv, port: serverPort });
        } catch (err) {
            log(`${label ? label + ': ' : ''}Connection failed: ${err.response?.data?.message || err.message}`, 'error');
        } finally { setLoading(false); }
    };

    const doDisconnect = useCallback((silent = false) => {
        axios.post('/api/disconnect').catch(() => {});
        if (!silent) log(`${label ? label + ': ' : ''}Disconnected from ${connection?.server} / ${connection?.database}`, 'warn');
        onDisconnected();
        setSelectedEnv(''); setSelectedServerLabel(''); setSelectedDB(''); setUsername(''); setPassword('');
    }, [connection, onDisconnected, log, label]);

    const isConnected = !!connection;

    return (
        <div className="bg-brand-900 px-4 py-2 flex items-center gap-3 border-b border-brand-700/30 flex-shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isConnected ? 'bg-brand-300 shadow-brand-300/50 shadow-sm' : 'bg-gray-600'}`} />

            {label && <span className="text-brand-300/70 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">{label}</span>}

            {!isConnected ? (
                <>
                    <select className="bg-brand-900/80 text-gray-200 text-xs px-2 py-1.5 rounded border border-brand-700/40 focus:border-brand-500 outline-none"
                        value={selectedEnv} onChange={e => { setSelectedEnv(e.target.value); setSelectedServerLabel(''); setSelectedDB(''); }}>
                        <option value="">Environment</option>
                        {(config.environments || []).map(env => <option key={env.env_name} value={env.env_name}>{env.env_name}</option>)}
                    </select>
                    <select className="bg-brand-900/80 text-gray-200 text-xs px-2 py-1.5 rounded border border-brand-700/40 focus:border-brand-500 outline-none disabled:opacity-40"
                        value={selectedServerLabel} onChange={e => { setSelectedServerLabel(e.target.value); setSelectedDB(''); }} disabled={!selectedEnv}>
                        <option value="">Server</option>
                        {serverList.map(srv => <option key={srv.server_label} value={srv.server_label}>{srv.server_label}</option>)}
                    </select>
                    <select className="bg-brand-900/80 text-gray-200 text-xs px-2 py-1.5 rounded border border-brand-700/40 focus:border-brand-500 outline-none disabled:opacity-40"
                        value={selectedDB} onChange={e => setSelectedDB(e.target.value)} disabled={!selectedServerLabel}>
                        <option value="">Database</option>
                        {dbList.map(db => <option key={db} value={db}>{db}</option>)}
                    </select>

                    {isSqlAuth && (
                        <>
                            <div className="h-5 w-px bg-brand-700/30" />
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
                                className="bg-brand-900/80 text-gray-200 text-xs px-2 py-1.5 rounded border border-brand-700/40 focus:border-brand-500 outline-none w-24" />
                            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                                className="bg-brand-900/80 text-gray-200 text-xs px-2 py-1.5 rounded border border-brand-700/40 focus:border-brand-500 outline-none w-24" />
                        </>
                    )}

                    <span className="text-[10px] text-brand-700/70 flex items-center gap-1 flex-shrink-0">
                        {isSqlAuth ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                        {isSqlAuth ? 'SQL Auth' : 'Windows Auth'}
                    </span>

                    <button onClick={handleConnect}
                        disabled={!selectedDB || loading || (isSqlAuth && (!username || !password))}
                        className="bg-brand-700 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs px-3 py-1.5 rounded font-bold flex items-center gap-1.5 transition-colors">
                        <Plug className="w-3.5 h-3.5" />
                        {loading ? 'Connecting...' : 'Connect'}
                    </button>
                </>
            ) : (
                <>
                    <span className="text-brand-300 text-xs font-bold">Connected</span>
                    <span className="text-gray-400 text-xs">
                        {connection.env} &rarr; {connection.server}{connection.port ? `:${connection.port}` : ''} &rarr; <strong className="text-gray-200">{connection.database}</strong>
                    </span>
                    <span className="text-[10px] text-brand-700/60 flex items-center gap-1">
                        {isSqlAuth ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                        {isSqlAuth ? 'SQL Auth' : 'Win Auth'}
                    </span>
                    <div className="flex-1" />
                    <button onClick={() => doDisconnect(false)}
                        className="bg-red-900/50 hover:bg-red-800 text-red-300 text-xs px-3 py-1.5 rounded font-bold flex items-center gap-1.5 transition-colors">
                        <Unplug className="w-3.5 h-3.5" /> Disconnect
                    </button>
                </>
            )}
        </div>
    );
};

export default ConnectionBar;
