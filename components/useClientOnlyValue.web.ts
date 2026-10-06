import { useSyncExternalStore } from 'react';

// `useSyncExternalStore` only subscribes on the client, so the server
// snapshot is returned during static rendering and the client value after
// hydration — without a setState-in-effect cascading render.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return useSyncExternalStore(
    () => () => {},
    () => client as S | C,
    () => server as S | C,
  );
}
