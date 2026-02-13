import React, { useState, useRef, useEffect } from 'react';
import { ConsoleProvider } from './context/ConsoleContext';
import Sidebar from './components/common/Sidebar';
import ConsolePanel from './components/common/ConsolePanel';
import Mod1page from './pages/Mod1page';
import Mod2page from './pages/Mod2page';
import Mod3page from './pages/Mod3page';

const AppInner = () => {
    const [activeModule, setActiveModule] = useState('sql-to-file');

    // ── Resizable console ──
    const [consoleHeight, setConsoleHeight] = useState(280);
    const dragging = useRef(false);
    const startY = useRef(0);
    const startH = useRef(0);

    const onMouseDown = (e) => {
        dragging.current = true;
        startY.current = e.clientY;
        startH.current = consoleHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!dragging.current) return;
            const delta = startY.current - e.clientY;
            setConsoleHeight(Math.max(100, Math.min(window.innerHeight - 200, startH.current + delta)));
        };
        const onMouseUp = () => {
            dragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
    }, [consoleHeight]);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
            {/* Sidebar */}
            <Sidebar activeModule={activeModule} onModuleChange={setActiveModule} />

            {/* Main Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Module Pages — all mounted, hidden via CSS to preserve state */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className={`flex-1 flex flex-col overflow-hidden ${activeModule === 'sql-to-file' ? '' : 'hidden'}`}>
                        <Mod1page />
                    </div>
                    <div className={`flex-1 flex flex-col overflow-hidden ${activeModule === 'sql-to-sql' ? '' : 'hidden'}`}>
                        <Mod2page />
                    </div>
                    <div className={`flex-1 flex flex-col overflow-hidden ${activeModule === 'file-to-file' ? '' : 'hidden'}`}>
                        <Mod3page />
                    </div>
                </div>

                {/* Drag handle */}
                <div onMouseDown={onMouseDown}
                    className="h-1.5 bg-gray-300 hover:bg-brand-700 cursor-row-resize flex-shrink-0 transition-colors relative group">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
                        <div className="w-8 h-0.5 bg-gray-400 group-hover:bg-white rounded-full" />
                    </div>
                </div>

                {/* Console */}
                <div style={{ height: consoleHeight }} className="flex-shrink-0 overflow-hidden">
                    <ConsolePanel />
                </div>
            </div>
        </div>
    );
};

const App = () => (
    <ConsoleProvider>
        <AppInner />
    </ConsoleProvider>
);

export default App;
