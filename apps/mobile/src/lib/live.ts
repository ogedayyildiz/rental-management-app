import { LIVE_EVENTS, type MachineLiveState } from '@rental/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { api, API_URL, type Machine } from './api';

export const machinesKey = ['machines'] as const;

/** Machine list kept current by the API's Socket.IO live feed (same as the web app). */
export function useLiveMachines() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: machinesKey, queryFn: () => api<Machine[]>('/machines') });

  useEffect(() => {
    // TODO(auth): pass the session token in `auth`.
    const socket = io(`${API_URL}/live`, { transports: ['websocket'] });
    socket.on(LIVE_EVENTS.machineState, (s: MachineLiveState & { lastSeenAt: string }) => {
      queryClient.setQueryData<Machine[]>(machinesKey, (prev) =>
        prev?.map((m) =>
          m.id === s.machineId
            ? {
                ...m,
                lastSeenAt: s.lastSeenAt,
                lat: s.lat,
                lon: s.lon,
                batterySoc: s.batterySoc,
                engineHours: s.engineHours,
                ignition: s.ignition,
                activeErrorCodes: s.activeErrorCodes,
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
