import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { ChatMessage, MapPoint, MapPointsFile, MapRoute, MapRoutesFile, MapStateResponse } from "../src/shared/schema.js";
import "./style.css";

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    __GUANGZHOU_MAP__?: {
      ready: boolean;
      markerCount: number;
      error?: string;
    };
  }
}

interface AMapNamespace {
  Map: new (container: string | HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  Pixel: new (x: number, y: number) => unknown;
  Polyline: new (options: Record<string, unknown>) => AMapPolyline;
}

interface AMapMap {
  add(overlays: unknown[]): void;
  remove(overlays: unknown[]): void;
  setFitView(overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number): void;
  on(event: string, callback: () => void): void;
}

interface AMapMarker {
  on(event: string, callback: () => void): void;
}
interface AMapPolyline {}

type ChipStyle = CSSProperties & {
  "--chip-color"?: string;
};

const routePadding = [150, 120, 120, 120];

function App() {
  const [state, setState] = useState<MapStateResponse | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [status, setStatus] = useState("正在加载地图数据...");
  const [error, setError] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiResponse, setAiResponse] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const nextState = await apiGet<MapStateResponse>("/api/map-state");
    setState(nextState);
    setStatus("");
    window.__GUANGZHOU_MAP__ = { ready: false, markerCount: 0 };
  }, []);

  useEffect(() => {
    loadState().catch((caught) => {
      const message = messageFromError(caught);
      setError(message);
      setStatus(message);
      window.__GUANGZHOU_MAP__ = { ready: false, markerCount: 0, error: message };
    });
  }, [loadState]);

  const mapState = state?.preview ?? state?.current ?? null;
  const routeState = state?.preview_routes ?? state?.routes ?? { routes: [] };
  const visiblePoints = useMemo(() => mapState?.points.filter((point) => point.visible !== false) ?? [], [mapState]);
  const hasPreview = Boolean(state?.preview);

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setStatus("正在生成 AI 预览...");
    try {
      const result = await apiPost<MapStateResponse & { response_text?: string }>("/api/chat", {
        message,
        messages: chatMessages
      });
      const assistantMessage = result.response_text ?? "已生成预览，等待确认。";
      setState(result);
      setAiResponse(assistantMessage);
      const nextMessages: ChatMessage[] = [
        { role: "user", content: message },
        { role: "assistant", content: assistantMessage }
      ];
      setChatMessages((currentMessages) => [...currentMessages, ...nextMessages].slice(-10));
      setActiveGroup(null);
      setActiveRouteId(null);
      setStatus("");
    } catch (caught) {
      const messageText = messageFromError(caught);
      setError(messageText);
      setStatus(messageText);
    } finally {
      setIsWorking(false);
    }
  }

  async function applyPreview() {
    setIsWorking(true);
    setError(null);
    setStatus("正在应用预览...");
    try {
      setState(await apiPost<MapStateResponse>("/api/apply-preview", {}));
      setAiResponse("预览已应用。");
      setActiveRouteId(null);
      setStatus("");
    } catch (caught) {
      const message = messageFromError(caught);
      setError(message);
      setStatus(message);
    } finally {
      setIsWorking(false);
    }
  }

  async function revertPreview() {
    setIsWorking(true);
    setError(null);
    setStatus("正在恢复 generated 状态...");
    try {
      setState(await apiPost<MapStateResponse>("/api/revert-preview", {}));
      setAiResponse("已恢复到 generated 状态。");
      setActiveGroup(null);
      setActiveRouteId(null);
      setStatus("");
    } catch (caught) {
      const message = messageFromError(caught);
      setError(message);
      setStatus(message);
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <div className="map-filter-panel" aria-label="地图筛选">
        <GroupFilter
          points={visiblePoints}
          activeGroup={activeGroup}
          onSelect={(groupName) => {
            setActiveGroup(groupName);
            setActiveRouteId(null);
          }}
        />
        <RouteFilter
          routes={routeState.routes}
          activeRouteId={activeRouteId}
          onSelect={(routeId) => {
            setActiveRouteId(routeId);
            setActiveGroup(null);
          }}
        />
      </div>
      <MapCanvas
        mapState={mapState}
        routes={routeState}
        activeGroup={activeGroup}
        activeRouteId={activeRouteId}
        onGroupSelect={setActiveGroup}
        onStatus={setStatus}
      />
      <AiPanel
        message={chatMessage}
        response={aiResponse}
        hasPreview={hasPreview}
        isWorking={isWorking}
        error={error}
        onMessageChange={setChatMessage}
        onSubmit={submitChat}
        onApply={applyPreview}
        onRevert={revertPreview}
      />
      <div id="status" role="status">
        {status}
      </div>
    </>
  );
}

function GroupFilter({
  points,
  activeGroup,
  onSelect
}: {
  points: MapPoint[];
  activeGroup: string | null;
  onSelect: (groupName: string | null) => void;
}) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, { name: string; type: string; color: string; count: number }>();
    for (const point of points) {
      const current = byGroup.get(point.group_name);
      if (current) {
        current.count += 1;
      } else {
        byGroup.set(point.group_name, {
          name: point.group_name,
          type: point.group_type,
          color: colorForGroup(point),
          count: 1
        });
      }
    }
    return Array.from(byGroup.values());
  }, [points]);

  return (
    <nav id="group-filter" aria-label="地图地点组筛选">
      <button className={`group-chip ${activeGroup ? "" : "active"}`} type="button" aria-pressed={!activeGroup} onClick={() => onSelect(null)}>
        <span className="group-chip-dot all" />
        <span className="group-chip-label">全部地点</span>
        <span className="group-chip-count">{points.length}</span>
      </button>
      {groups.map((group) => {
        const isActive = activeGroup === group.name;
        return (
          <button
            className={`group-chip ${isActive ? "active" : ""}`}
            type="button"
            aria-pressed={isActive}
            style={{ "--chip-color": group.color } as ChipStyle}
            key={group.name}
            onClick={() => onSelect(isActive ? null : group.name)}
          >
            <span className="group-chip-dot" />
            <span className="group-chip-label">{group.name}</span>
            <span className="group-chip-count">{group.count}</span>
          </button>
        );
      })}
    </nav>
  );
}

function RouteFilter({
  routes,
  activeRouteId,
  onSelect
}: {
  routes: MapRoute[];
  activeRouteId: string | null;
  onSelect: (routeId: string | null) => void;
}) {
  if (routes.length === 0) {
    return null;
  }

  return (
    <div className="route-filter" aria-label="路线筛选">
      <button className={`route-chip ${activeRouteId ? "" : "active"}`} type="button" aria-pressed={!activeRouteId} onClick={() => onSelect(null)}>
        <span className="route-chip-line all" />
        <span className="route-chip-label">全部路线</span>
        <span className="route-chip-count">{routes.length}</span>
      </button>
      {routes.map((route) => {
        const isActive = activeRouteId === route.id;
        return (
          <button
            className={`route-chip ${isActive ? "active" : ""}`}
            type="button"
            aria-pressed={isActive}
            style={{ "--chip-color": route.color } as ChipStyle}
            key={route.id}
            onClick={() => onSelect(isActive ? null : route.id)}
          >
            <span className="route-chip-line" />
            <span className="route-chip-label">{route.name}</span>
            <span className="route-chip-count">{route.point_ids.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function MapCanvas({
  mapState,
  routes,
  activeGroup,
  activeRouteId,
  onGroupSelect,
  onStatus
}: {
  mapState: MapPointsFile | null;
  routes: MapRoutesFile;
  activeGroup: string | null;
  activeRouteId: string | null;
  onGroupSelect: (groupName: string) => void;
  onStatus: (message: string) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const overlaysRef = useRef<unknown[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!mapElementRef.current || !mapState) {
        return;
      }

      const key = import.meta.env.VITE_AMAP_JS_API_KEY;
      const securityJsCode = import.meta.env.VITE_AMAP_JS_API_SECURITY_JS_CODE;
      if (!key) {
        throw new Error("Missing AMAP_JS_API_KEY. Set it in .env, then restart npm run dev.");
      }
      if (!securityJsCode) {
        throw new Error("Missing AMAP_JS_API_SECURITY_JS_CODE. Set it in .env, then restart npm run dev.");
      }

      const visiblePoints = mapState.points.filter((point) => point.visible !== false);
      if (visiblePoints.length === 0) {
        throw new Error("当前地图状态没有可渲染的点。");
      }

      onStatus("正在加载高德地图...");
      const AMap = amapRef.current ?? (await loadAmap(key, securityJsCode));
      amapRef.current = AMap;
      if (cancelled) {
        return;
      }

      if (!mapRef.current) {
        mapRef.current = new AMap.Map(mapElementRef.current, {
          zoom: 12,
          center: getAverageCenter(visiblePoints),
          resizeEnable: true,
          viewMode: "2D",
          features: ["bg", "road", "building", "point"]
        });
      }

      if (overlaysRef.current.length > 0) {
        mapRef.current.remove(overlaysRef.current);
      }

      const pointsById = new Map(visiblePoints.map((point) => [point.id, point]));
      const visibleRoutes = activeRouteId ? routes.routes.filter((route) => route.id === activeRouteId) : routes.routes;
      const routePointIds = new Set(visibleRoutes.flatMap((route) => route.point_ids));
      const routeOverlays = visibleRoutes.flatMap((route) => {
        const path = route.point_ids
          .map((pointId) => pointsById.get(pointId))
          .filter((point): point is MapPoint => Boolean(point))
          .map((point) => [point.longitude, point.latitude]);

        if (path.length < 2) {
          return [];
        }

        return [
          new AMap.Polyline({
            path,
            strokeColor: route.color,
            strokeWeight: 5,
            strokeOpacity: 0.86,
            zIndex: 60,
            lineJoin: "round",
            lineCap: "round"
          })
        ];
      });

      const markers = visiblePoints.map((point) => {
        const marker = new AMap.Marker({
          position: [point.longitude, point.latitude],
          offset: new AMap.Pixel(0, 0),
          anchor: "center",
          title: markerTitle(point),
          content: markerHtml(point, activeGroup)
        });
        marker.on("click", () => {
          if (activeGroup !== point.group_name) {
            onGroupSelect(point.group_name);
          }
        });
        return marker;
      });

      const overlays = [...routeOverlays, ...markers];
      mapRef.current.add(overlays);
      overlaysRef.current = overlays;

      window.setTimeout(() => {
        if (cancelled || !mapRef.current) {
          return;
        }
        const fitTargets = activeRouteId
          ? [
              ...routeOverlays,
              ...markers.filter((_, index) => {
                const point = visiblePoints[index];
                return point ? routePointIds.has(point.id) : false;
              })
            ]
          : activeGroup
            ? markers.filter((_, index) => visiblePoints[index]?.group_name === activeGroup)
            : overlays;
        mapRef.current.setFitView(fitTargets.length > 0 ? fitTargets : overlays, false, routePadding, 16);
        onStatus("");
        window.__GUANGZHOU_MAP__ = { ready: true, markerCount: markers.length };
      }, 400);
    }

    renderMap().catch((caught) => {
      const message = messageFromError(caught);
      onStatus(message);
      window.__GUANGZHOU_MAP__ = { ready: false, markerCount: 0, error: message };
    });

    return () => {
      cancelled = true;
    };
  }, [activeGroup, activeRouteId, mapState, onGroupSelect, onStatus, routes]);

  return <div id="map" ref={mapElementRef} role="main" aria-label="广州游玩攻略地图" />;
}

function AiPanel({
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

async function loadAmap(key: string, securityJsCode: string): Promise<AMapNamespace> {
  if (window.AMap) {
    return window.AMap;
  }

  window._AMapSecurityConfig = {
    securityJsCode
  };

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load AMap JS API. Check AMAP_JS_API_KEY, AMAP_JS_API_SECURITY_JS_CODE, and network access."));
    document.head.appendChild(script);
  });

  if (!window.AMap) {
    throw new Error("AMap JS API loaded, but window.AMap is unavailable.");
  }

  return window.AMap;
}

function markerHtml(point: MapPoint, activeGroup: string | null): string {
  const title = markerTitle(point);
  const isActive = !activeGroup || activeGroup === point.group_name;
  const classes = ["map-marker", activeGroup && isActive ? "active" : "", !isActive ? "inactive" : ""].filter(Boolean).join(" ");
  return `<div class="${classes}" data-group="${escapeHtml(point.group_name)}" style="--marker-color: ${escapeHtml(colorForGroup(point))}" aria-label="${escapeHtml(title)}"><span class="map-marker-label">${escapeHtml(point.label)}</span><span class="map-marker-tooltip">${escapeHtml(title)}</span></div>`;
}

function markerTitle(point: MapPoint): string {
  const branchName = point.branch_name.trim();
  if (!branchName) {
    return point.group_name;
  }

  const normalizedGroup = normalizeName(point.group_name);
  const normalizedBranch = normalizeName(branchName);
  if (normalizedBranch === normalizedGroup || normalizedBranch.includes(normalizedGroup)) {
    return branchName;
  }

  return `${point.group_name} ${branchName}`;
}

function colorForGroup(point: MapPoint): string {
  if (point.group_color) {
    return point.group_color;
  }

  const colors = ["#d84f3a", "#247b5f", "#4d64c8", "#8a5a32", "#8f4fc7", "#cc7a1f", "#3d7f89", "#b9486a"];
  let hash = 0;
  for (const char of point.group_name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return colors[hash % colors.length];
}

function getAverageCenter(points: MapPoint[]): [number, number] {
  const totals = points.reduce(
    (acc, point) => {
      acc.longitude += point.longitude;
      acc.latitude += point.latitude;
      return acc;
    },
    { longitude: 0, latitude: 0 }
  );

  return [totals.longitude / points.length, totals.latitude / points.length];
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return parseApiResponse<T>(response);
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseApiResponse<T>(response);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.querySelector("#root") as HTMLElement).render(<App />);
