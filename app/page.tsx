import { MapApp } from "./components/MapApp";
import { getClientConfig } from "../src/server/client-config";
import { readFullState } from "../src/server/map-state";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [initialState, clientConfig] = await Promise.all([readFullState(), getClientConfig()]);
  return <MapApp initialState={initialState} clientConfig={clientConfig} />;
}
