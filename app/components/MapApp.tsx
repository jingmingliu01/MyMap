"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChatMessage, MapPointsFile, MapStateResponse } from "../../src/shared/schema";
import type { ClientConfig } from "../types/client-config";
import { AiPanel } from "./AiPanel";
import { CategoryFilter, PlaceFilter, TagFilter } from "./MapFilters";
import { MapCanvas } from "./MapCanvas";
import { RouteFilter } from "./RouteFilter";
import { useAiChat } from "../hooks/useAiChat";
import { useMapState } from "../hooks/useMapState";
import { messageFromError } from "../lib/errors";

export function MapApp({ initialState, clientConfig }: { initialState: MapStateResponse; clientConfig: ClientConfig }) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [placesCollapsed, setPlacesCollapsed] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const {
    setState,
    mapState,
    routeState,
    visiblePoints,
    hasPreview,
    status,
    setStatus,
    error,
    setError,
    applyPreview,
    revertPreview
  } = useMapState(initialState);

  const { aiResponse, setAiResponse, isWorking, setIsWorking, submitChat } = useAiChat({
    chatMessage,
    setChatMessage,
    chatMessages,
    setChatMessages,
    setMapState: setState,
    setStatus,
    setError,
    onPreviewReady: () => {
      clearMapFilters();
      setActiveRouteId(null);
    },
    clientMessageHistory: clientConfig.aiClientMessageHistory
  });

  const handleApplyPreview = useCallback(async () => {
    setIsWorking(true);
    try {
      await applyPreview();
      setAiResponse("预览已应用。");
      setActiveRouteId(null);
    } catch (caught) {
      const message = messageFromError(caught);
      setError(message);
      setStatus(message);
    } finally {
      setIsWorking(false);
    }
  }, [applyPreview, setAiResponse, setError, setIsWorking, setStatus]);

  const handleRevertPreview = useCallback(async () => {
    setIsWorking(true);
    try {
      await revertPreview();
      setAiResponse("已放弃预览，当前地图保持不变。");
      clearMapFilters();
      setActiveRouteId(null);
    } catch (caught) {
      const message = messageFromError(caught);
      setError(message);
      setStatus(message);
    } finally {
      setIsWorking(false);
    }
  }, [revertPreview, setAiResponse, setError, setIsWorking, setStatus]);

  const handleMarkerPlaceSelect = useCallback((placeId: string) => {
    setActivePlaceId(placeId);
    setActiveRouteId(null);
  }, []);

  const basePoints = visiblePoints;
  const categoryTagFilteredPoints = useMemo(
    () => basePoints.filter((point) => matchesCategory(point, activeCategoryId) && matchesTag(point, activeTagId)),
    [activeCategoryId, activeTagId, basePoints]
  );
  const displayedMapState: MapPointsFile | null = useMemo(
    () =>
      mapState
        ? {
            ...mapState,
            points: mapState.points.map((point) => ({
              ...point,
              visible:
                point.visible !== false &&
                matchesCategory(point, activeCategoryId) &&
                matchesTag(point, activeTagId) &&
                matchesPlace(point, activePlaceId)
            }))
          }
        : null,
    [activeCategoryId, activePlaceId, activeTagId, mapState]
  );

  function clearMapFilters() {
    setActiveCategoryId(null);
    setActiveTagId(null);
    setActivePlaceId(null);
  }

  return (
    <>
      <div className="map-filter-panel" aria-label="地图筛选">
        <CategoryFilter
          points={basePoints}
          activeCategoryId={activeCategoryId}
          onSelect={(categoryId) => {
            setActiveCategoryId(categoryId);
            setActivePlaceId(null);
            setActiveRouteId(null);
          }}
        />
        <TagFilter
          points={basePoints}
          routes={routeState.routes}
          activeTagId={activeTagId}
          onSelect={(tagId) => {
            setActiveTagId(tagId);
            setActivePlaceId(null);
            setActiveRouteId(null);
          }}
        />
        <PlaceFilter
          points={categoryTagFilteredPoints}
          activePlaceId={activePlaceId}
          collapsed={placesCollapsed}
          onToggleCollapsed={() => setPlacesCollapsed((current) => !current)}
          onSelect={(placeId) => {
            setActivePlaceId(placeId);
            setActiveRouteId(null);
          }}
        />
        <RouteFilter
          routes={routeState.routes}
          activeRouteId={activeRouteId}
          onSelect={(routeId) => {
            setActiveRouteId(routeId);
            setActivePlaceId(null);
          }}
        />
      </div>
      <MapCanvas
        mapState={displayedMapState}
        routes={routeState}
        activePlaceId={activePlaceId}
        activeRouteId={activeRouteId}
        clientConfig={clientConfig}
        onPlaceSelect={handleMarkerPlaceSelect}
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
        onApply={handleApplyPreview}
        onRevert={handleRevertPreview}
      />
      <div id="status" role="status">
        {status}
      </div>
    </>
  );
}

function matchesCategory(point: { category_ids?: string[] }, categoryId: string | null): boolean {
  return !categoryId || Boolean(point.category_ids?.includes(categoryId));
}

function matchesTag(point: { tag_ids?: string[] }, tagId: string | null): boolean {
  return !tagId || Boolean(point.tag_ids?.includes(tagId));
}

function matchesPlace(point: { place_id: string }, placeId: string | null): boolean {
  return !placeId || point.place_id === placeId;
}
