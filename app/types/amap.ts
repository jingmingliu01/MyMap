export interface AMapNamespace {
  Map: new (container: string | HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  Pixel: new (x: number, y: number) => unknown;
  Polyline: new (options: Record<string, unknown>) => AMapPolyline;
}

export interface AMapMap {
  add(overlays: unknown[]): void;
  remove(overlays: unknown[]): void;
  setFitView(overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number): void;
}

export interface AMapMarker {
  on(event: string, callback: () => void): void;
}

export interface AMapPolyline {}

declare global {
  interface Window {
    AMap?: AMapNamespace;
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
