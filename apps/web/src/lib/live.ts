"use client";

import { LIVE_EVENTS, type MachineLiveState } from "@rental/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { api, API_URL, type Json, type Machine } from "./api";

export const machinesKey = ["machines"] as const;

/**
 * Machine list that stays current: loaded once over REST, then patched in
 * place from the Socket.IO live feed.
 */
export function useLiveMachines() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: machinesKey, queryFn: () => api<Machine[]>("/machines") });

  useEffect(() => {
    // TODO(auth): send the session token instead of relying on the dev org fallback.
    const socket = io(`${API_URL}/live`, { transports: ["websocket"] });
    socket.on(LIVE_EVENTS.machineState, (state: Json<MachineLiveState>) => {
      queryClient.setQueryData<Machine[]>(machinesKey, (prev) =>
        prev?.map((m) =>
          m.id === state.machineId
            ? {
                ...m,
                lastSeenAt: state.lastSeenAt,
                lat: state.lat,
                lon: state.lon,
                batterySoc: state.batterySoc,
                engineHours: state.engineHours,
                ignition: state.ignition,
                activeErrorCodes: state.activeErrorCodes,
              }
            : m,
        ),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return query;
}
