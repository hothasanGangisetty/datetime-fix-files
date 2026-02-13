import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useConsole } from '../../context/ConsoleContext';
import { Upload, FileText, CheckCircle2, X } from 'lucide-react';

const FileUploadTab2 = ({ fileState, setFileState, onNext }) => {
    const { log, logTable } = useConsole();
    const [loading, setLoading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);

    const handleFile = async (file) => {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx', 'xls'].includes(ext)) { log(`Invalid file type: .${ext}`, 'error'); return; }
        setLoading(true);
        log(`[File 2] Uploading: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`, 'info');
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('/api/upload_file', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            const { file_id, columns, preview_data, total_rows } = res.data;
            setFileState({ fileId: file_id, fileName: file.name, columns: columns || [], rows: preview_data || [], count: total_rows || 0, uploaded: true });
            log(`[File 2] Uploaded: ${file.name} — ${total_rows} rows, ${(columns || []).length} columns`, 'success');
            logTable(columns || [], preview_data || [], 10);
            log('→ Click Next to proceed to Keys Mapping', 'system');
        } catch (err) { log(`[File 2] Upload failed: ${err.response?.data?.message || err.message}`, 'error'); }
        finally { setLoading(false); }
    };

    const handleRemove = () => {
        log(`[File 2] Removed: ${fileState.fileName}`, 'warn');
        setFileState({ fileId: null, fileName: '', columns: [], rows: [], count: 0, uploaded: false });
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            <div className="flex items-center gap-2 text-slate-700">
                <FileText className="w-5 h-5 text-brand-500" />
                <h3 className="font-bold text-sm">File Upload — Source 2</h3>
                {fileState.uploaded && <span className="ml-auto text-xs bg-brand-100 text-brand-900 px-2 py-0.5 rounded font-bold">✓ {fileState.count} rows</span>}
            </div>
            {!fileState.uploaded ? (
                <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                    className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer min-h-[160px]
                        ${dragOver ? 'border-brand-500 bg-brand-100/30' : 'border-gray-300 bg-slate-50 hover:border-brand-700/40'}`}
                    onClick={() => inputRef.current?.click()}>
                    <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => handleFile(e.target.files[0])} className="hidden" />
                    {loading ? (
                        <><div className="animate-spin w-8 h-8 border-3 border-brand-700 border-t-transparent rounded-full" /><span className="text-sm text-gray-500">Uploading...</span></>
                    ) : (
                        <><Upload className="w-10 h-10 text-gray-400" /><span className="text-sm text-gray-500 font-medium">Drag & drop or click — File 2</span><span className="text-xs text-gray-400">Supports .csv, .xlsx, .xls</span></>
                    )}
                </div>
            ) : (
                <div className="flex-1 flex flex-col gap-3">
                    <div className="flex items-center gap-3 p-4 bg-brand-100/30 border border-brand-500/30 rounded-lg">
                        <CheckCircle2 className="w-6 h-6 text-brand-500 flex-shrink-0" />
                        <div className="flex-1">
                            <div className="font-bold text-sm text-brand-900">{fileState.fileName}</div>
                            <div className="text-xs text-brand-700">{fileState.count} rows &middot; {fileState.columns.length} columns</div>
                        </div>
                        <button onClick={handleRemove} className="text-gray-400 hover:text-red-500 transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="text-xs text-gray-500"><strong>Columns:</strong> {(fileState.columns || []).join(', ')}</div>
                </div>
            )}
            <div className="flex justify-end">
                <button onClick={onNext} disabled={!fileState.uploaded}
                    className="bg-brand-500 hover:bg-brand-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">Next →</button>
            </div>
        </div>
    );
};

export default FileUploadTab2;
