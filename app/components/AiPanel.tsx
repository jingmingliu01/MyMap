import type { FormEvent } from "react";

export function AiPanel({
  message,
  response,
  hasPreview,
  isWorking,
  error,
  onMessageChange,
  onSubmit,
  onApply,
  onRevert
}: {
  message: string;
  response: string;
  hasPreview: boolean;
  isWorking: boolean;
  error: string | null;
  onMessageChange: (message: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onApply: () => void;
  onRevert: () => void;
}) {
  return (
    <aside className="ai-panel" aria-label="AI 地图编辑">
      <form className="ai-form" onSubmit={onSubmit}>
        <textarea
          value={message}
          rows={3}
          placeholder="例如：请只保留脆鲩人家的天河店，并把广州塔、海心桥、永庆坊连成一条路线"
          onChange={(event) => onMessageChange(event.target.value)}
        />
        <button type="submit" disabled={isWorking || !message.trim()}>
          {isWorking ? "处理中" : "预览"}
        </button>
      </form>
      {(response || error || hasPreview) && (
        <div className="ai-result">
          {response && <p>{response}</p>}
          {error && <p className="ai-error">{error}</p>}
          {hasPreview && (
            <div className="ai-actions">
              <button type="button" onClick={onApply} disabled={isWorking}>
                应用
              </button>
              <button type="button" onClick={onRevert} disabled={isWorking}>
                Revert
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
