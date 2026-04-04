import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 60_000,       // 60s — évite re-fetch inutile
			gcTime: 5 * 60_000,    // 5min — garde le cache en mémoire
		},
	},
});