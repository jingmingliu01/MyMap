"use client";

import { useCallback, useState } from "react";
import type { ChatMessage, MapStateResponse } from "../../src/shared/schema";
import type { ClientConfig } from "../types/client-config";
import { AiPanel } from "./AiPanel";
import { GroupFilter } from "./GroupFilter";
import { MapCanvas } from "./MapCanvas";
import { RouteFilter } from "./RouteFilter";
import { useAiChat } from "../hooks/useAiChat";
import { useMapState } from "../hooks/useMapState";
import { messageFromError } from "../lib/errors";

export function MapApp({ initialState, clientConfig }: { initialState: MapStateResponse; clientConfig: ClientConfig }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
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
      setActiveGroup(null);
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
      setAiResponse("已恢复到 generated 状态。");
      setActiveGroup(null);
      setActiveRouteId(null);
    } catch (caught) {
      const message = messageFromError(caught);
      setError(message);
      setStatus(message);
    } finally {
      setIsWorking(false);
    }
  }, [revertPreview, setAiResponse, setError, setIsWorking, setStatus]);

  const handleMarkerGroupSelect = useCallback((groupName: string) => {
    setActiveGroup(groupName);
    setActiveRouteId(null);
  }, []);

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
        clientConfig={clientConfig}
        onGroupSelect={handleMarkerGroupSelect}
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
