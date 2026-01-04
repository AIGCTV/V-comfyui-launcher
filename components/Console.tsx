import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2, Play, Square } from 'lucide-react';
import { LogEntry, AppStatus } from '../types';
import { useTranslation } from '../i18n';

interface ConsoleProps {
  logs: LogEntry[];
  status: AppStatus;
  onOpenCmd: () => void;
  onClearLogs: () => void;
  onStart: () => void;
  onStop: () => void;
}

export const Console: React.FC<ConsoleProps> = ({
  logs,
  status,
  onOpenCmd,
  onClearLogs,
  onStart,
  onStop
}) => {
  const { t } = useTranslation();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const isRunning = status === AppStatus.RUNNING || status === AppStatus.STARTING;

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2 text-gray-200 font-semibold">
          <Terminal size={18} className="text-blue-500" />
          {t('console.title')}
        </div>

        <div className="flex items-center gap-3">
          {/* Terminal Button */}
          <button
            onClick={onOpenCmd}
            className="flex items-center justify-center w-8 h-8 bg-gray-800 hover:bg-gray-700 hover:text-white text-gray-400 border border-gray-600 rounded transition-all"
            title={t('console.openTerminal')}
          >
            <Terminal size={16} />
          </button>

          {/* Stop Button */}
          <button
            onClick={onStop}
            disabled={!isRunning}
            className={`flex items-center justify-center w-8 h-8 rounded border transition-all ${isRunning
              ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white'
              : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
              }`}
            title={t('dashboard.stopped')}
          >
            <Square size={16} fill={isRunning ? "currentColor" : "none"} />
          </button>

          {/* Start Button */}
          <button
            onClick={onStart}
            disabled={isRunning}
            className={`flex items-center justify-center w-8 h-8 rounded border transition-all ${!isRunning
              ? 'bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500 hover:text-white'
              : 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
              }`}
            title={t('sidebar.dashboard')}
          >
            <Play size={16} fill={!isRunning ? "currentColor" : "none"} />
          </button>

          <div className="w-px h-6 bg-gray-700 mx-1"></div>

          {/* Clear Logs */}
          <button
            onClick={onClearLogs}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
            title={t('console.clear')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Logs Area */}
      <div className="flex-1 p-4 overflow-y-auto scrollbar-default font-mono text-sm space-y-1">
        {logs.length === 0 && (
          <div className="text-gray-600 italic select-none mt-4 text-center">{t('common.loading')}</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="break-all flex gap-2 hover:bg-white/5 p-0.5 rounded">
            <span className="text-gray-600 select-none shrink-0">[{log.timestamp}]</span>
            <span className={`${log.type === 'error' ? 'text-red-400' :
              log.type === 'system' ? 'text-blue-400 font-bold' : 'text-gray-300'
              }`}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};