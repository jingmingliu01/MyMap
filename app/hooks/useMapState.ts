import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapPoint, MapStateResponse } from "../../src/shared/schema";
import { apiPost } from "../lib/api-client";

export function useMapState(initialState: MapStateResponse) {
  const [state, setState] = useState<MapStateResponse | null>(initialState);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.__MYMAP__ = { ready: false, markerCount: 0 };
  }, []);

  const mapState = state?.preview ?? state?.rendered ?? null;
  const routeState = state?.preview_routes ?? state?.routes ?? { routes: [] };
  const visiblePoints = useMemo<MapPoint[]>(() => mapState?.points.filter((point) => point.visible !== false) ?? [], [mapState]);

  const applyPreview = useCallback(async () => {
    setError(null);
    setStatus("正在应用预览...");
    const nextState = await apiPost<MapStateResponse>("/api/apply-preview", {});
    setState(nextState);
    setStatus("");
  }, []);

  const revertPreview = useCallback(async () => {
    setError(null);
    setStatus("正在放弃预览...");
    const nextState = await apiPost<MapStateResponse>("/api/revert-preview", {});
    setState(nextState);
    setStatus("");
  }, []);

  return {
    state,
    setState,
    mapState,
    routeState,
    visiblePoints,
    hasPreview: Boolean(state?.preview || state?.preview_routes),
    status,
    setStatus,
    error,
    setError,
    applyPreview,
    revertPreview
  };
}
