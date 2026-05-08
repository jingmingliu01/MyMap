import { useEffect, useRef } from "react";
import type { MapPoint, MapPointsFile, MapRoutesFile } from "../../src/shared/schema";
import { messageFromError } from "../lib/errors";
import { loadAmap } from "../map/amap-loader";
import { markerHtml, markerTitle } from "../map/marker";
import type { AMapMap, AMapNamespace } from "../types/amap";
import type { ClientConfig } from "../types/client-config";

const routePadding = [150, 120, 120, 120];

export function MapCanvas({
  mapState,
  routes,
  activeGroup,
  activeRouteId,
  clientConfig,
  onGroupSelect,
  onStatus
}: {
  mapState: MapPointsFile | null;
  routes: MapRoutesFile;
  activeGroup: string | null;
  activeRouteId: string | null;
  clientConfig: ClientConfig;
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

      if (!clientConfig.amapJsApiKey) {
        throw new Error("Missing AMAP_JS_API_KEY. Set it in .env, then restart npm run dev.");
      }
      if (!clientConfig.amapJsApiSecurityJsCode) {
        throw new Error("Missing AMAP_JS_API_SECURITY_JS_CODE. Set it in .env, then restart npm run dev.");
      }

      const visiblePoints = mapState.points.filter((point) => point.visible !== false);
      if (visiblePoints.length === 0) {
        throw new Error("当前地图状态没有可渲染的点。");
      }

      onStatus("正在加载高德地图...");
      const AMap =
        amapRef.current ?? (await loadAmap(clientConfig.amapJsApiKey, clientConfig.amapJsApiSecurityJsCode, clientConfig.amapJsApiVersion));
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
        window.__MYMAP__ = { ready: true, markerCount: markers.length };
      }, 400);
    }

    renderMap().catch((caught) => {
      const message = messageFromError(caught);
      onStatus(message);
      window.__MYMAP__ = { ready: false, markerCount: 0, error: message };
    });

    return () => {
      cancelled = true;
      if (mapRef.current && overlaysRef.current.length > 0) {
        mapRef.current.remove(overlaysRef.current);
        overlaysRef.current = [];
      }
    };
  }, [
    activeGroup,
    activeRouteId,
    clientConfig.amapJsApiKey,
    clientConfig.amapJsApiSecurityJsCode,
    clientConfig.amapJsApiVersion,
    mapState,
    onGroupSelect,
    onStatus,
    routes
  ]);

  return <div id="map" ref={mapElementRef} role="main" aria-label={`${mapState?.city ?? "城市"}攻略地图`} />;
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
