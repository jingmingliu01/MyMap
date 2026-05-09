import type {} from "@amap/amap-jsapi-types";

export type AMapNamespace = typeof AMap;
export type AMapMap = AMap.Map;
export type AMapMarker = AMap.Marker;
export type AMapPolyline = AMap.Polyline;
export type AMapOverlay = AMapMarker | AMapPolyline;

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    __MYMAP__?: {
      ready: boolean;
      markerCount: number;
      error?: string;
    };
  }
}
