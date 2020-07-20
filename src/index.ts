import { useState, useRef, useEffect, useMemo, useReducer } from "react";
import { getResourceLoadingInfo, ResourceLoading } from "./data";
import { createDependenciesInfoHook } from "react-dependency-hooks";

interface CurrentState<Deps extends any> {
	shouldBeCancelled: () => boolean;
	getLastDependencies: () => Deps;
}

const defaultDependenciesInfo = createDependenciesInfoHook();

type DepsInfoHook = <T extends readonly any[]>(
	...args: T
) => {
	getVersion: () => number;
	getStableVersion: () => number;
	getLastDependencies: () => T;
	isLastVersion: (version: number) => boolean;
	isStableVersion: (version?: number | undefined) => boolean;
	setAsStable: (version?: number) => void;
	unsafelyIncrementVersion: () => void;
};

export const createResourceLoadingHook = <DefaultKey extends string | null>({
	resourceKey,
	dependenciesInfoHook: useDependenciesInfo = defaultDependenciesInfo,
	defaultIsIdentificationKnownFn,
}: {
	resourceKey: DefaultKey;
	dependenciesInfoHook?: DepsInfoHook;
	defaultIsIdentificationKnownFn?: (deps: readonly any[]) => boolean;
}) => {
	type DataExt = DefaultKey extends string ? any : Record<any, any>;
	type FinalData<Data> = DefaultKey extends string
		? { [key in DefaultKey]: Data }
		: Data;
	type UseResourceLoading = {
		<Data extends DataExt, Deps extends readonly any[]>(
			args: {
				resource: Data | null | undefined;
				fetch: (
					args: CurrentState<Deps>
				) => undefined | Promise<unknown>;
				forcefullyFetch?: boolean;
			},
			isIdentificationKnown: boolean,
			dependencies: Deps
		): ResourceLoading<FinalData<Data>, () => void, any>;
		<Data extends DataExt, Deps extends readonly any[]>(
			args: {
				resource: Data | null | undefined;
				fetch: (
					args: CurrentState<Deps>
				) => undefined | Promise<unknown>;
				forcefullyFetch?: boolean;
			},
			dependencies: Deps
		): ResourceLoading<FinalData<Data>, () => void, any>;
	};

	const useResourceLoading: UseResourceLoading = (<
		DOC extends DataExt,
		Deps extends readonly any[]
	>(
		{
			resource,
			fetch,
			forcefullyFetch,
		}: {
			resource: DOC | null | undefined;
			fetch: (args: CurrentState<Deps>) => undefined | Promise<unknown>;
			forcefullyFetch?: boolean;
		},
		...args: any[]
	) => {
		const [error, setError] = useState<any>(null);
		const forceUpdate = useForceUpdate();

		const resourceRef = useRef(resource);
		resourceRef.current = resource;

		const errorRef = useRef(error);
		errorRef.current = error;

		const fetchRef = useRef(fetch);
		fetchRef.current = fetch;

		const isMountedRef = useMountInfo();

		const dependencies = args[args.length - 1];
		const depsInfo = useDependenciesInfo(...dependencies);

		if (depsInfo.getStableVersion() === 0 && !forcefullyFetch) {
			if (resource !== null && resource !== undefined) {
				depsInfo.setAsStable();
			}
		}

		const getResource = () => {
			if (errorRef.current !== null) setError(null);

			const version = depsInfo.getVersion();
			const currentState: CurrentState<Deps> = {
				shouldBeCancelled: () =>
					!isMountedRef.current || !depsInfo.isLastVersion(version),
				getLastDependencies: () => depsInfo.getLastDependencies(),
			};

			const promise: Promise<unknown> | undefined = fetchRef.current(
				currentState
			);

			if (!promise) {
				depsInfo.setAsStable(version);
				forceUpdate();
				return;
			}
			promise
				.then(() => {
					if (currentState.shouldBeCancelled()) {
						return;
					}
					depsInfo.setAsStable(version);
					forceUpdate();
				})
				.catch(e => {
					if (currentState.shouldBeCancelled()) {
						return;
					}
					depsInfo.setAsStable(version);
					setError(e);
					forceUpdate();
				});
		};
		const getResourceRef = useRef(getResource);
		getResourceRef.current = getResource;

		const currentVersion = depsInfo.getVersion();

		const isIdentificationKnown =
			args.length === 1
				? defaultIsIdentificationKnownFn
					? defaultIsIdentificationKnownFn(dependencies)
					: true
				: !!args[0];

		useEffect(() => {
			if (!isIdentificationKnown) return;
			if (!depsInfo.isStableVersion()) {
				getResourceRef.current();
			}
		}, [depsInfo, currentVersion, isIdentificationKnown, forcefullyFetch]);

		const fetched = depsInfo.isStableVersion();

		return useMemo(() => {
			const isSuccessfullyLoaded = fetched && !error;
			const finalError = fetched ? error : null;
			const finalResource = (isSuccessfullyLoaded
				? resourceKey
					? { [resourceKey as string]: resource }
					: resource
				: null) as Record<any, any> | null | undefined;
			return getResourceLoadingInfo({
				resource: finalResource,
				error: finalError,
				loadAgain: () => {
					depsInfo.unsafelyIncrementVersion();
					forceUpdate();
				},
				isIdentificationKnown,
			});
		}, [resource, fetched, isIdentificationKnown, error]);
	}) as any;
	return useResourceLoading;
};

export const createFetchHook = <DefaultKey extends string | null>({
	resourceKey,
	dependenciesInfoHook = defaultDependenciesInfo,
	defaultIsIdentificationKnownFn,
}: {
	resourceKey: DefaultKey;
	dependenciesInfoHook?: DepsInfoHook;
	defaultIsIdentificationKnownFn?: (deps: readonly any[]) => boolean;
}) => {
	const useResourceLoading = createResourceLoadingHook({
		resourceKey,
		dependenciesInfoHook,
		defaultIsIdentificationKnownFn,
	});
	type DataExt = DefaultKey extends string ? any : Record<any, any>;
	type FinalData<Data> = DefaultKey extends string
		? { [key in DefaultKey]: Data }
		: Data;

	type UseFetch = {
		<Data extends DataExt, Deps extends readonly any[]>(
			fetchResource: (args: CurrentState<Deps>) => Promise<Data>,
			dependencies: Deps
		): ResourceLoading<FinalData<Data>, () => void, any>;
		<Data extends DataExt, Deps extends readonly any[]>(
			fetchResource: (args: CurrentState<Deps>) => Promise<Data>,
			isIdentificationKnown: boolean,
			dependencies: Deps
		): ResourceLoading<FinalData<Data>, () => void, any>;
	};
	const useFetch: UseFetch = (arg: any, ...restArgs: any[]): any => {
		const [fetchedData, setFetchedData] = useState<any>(null);
		let fetchResource: any;
		let rest: any = undefined;
		if (typeof arg === "function") {
			fetchResource = arg;
		} else {
			({ fetchResource, ...rest } = arg);
		}

		return useResourceLoading(
			{
				resource: fetchedData,
				fetch: (...args) => {
					return fetchResource(...args).then(resource => {
						if (!args[0].shouldBeCancelled()) {
							setFetchedData(resource);
						}
					});
				},
				resourceKey: resourceKey as string,
				...rest,
			},
			...(restArgs as [boolean, any[]])
		);
	};
	return useFetch;
};

const useMountInfo = () => {
	const isMountedRef = useRef(true);
	useEffect(() => {
		return () => {
			isMountedRef.current = true;
		};
	}, []);
	return isMountedRef;
};

const useForceUpdate = () => {
	const [, forceUpdate] = useReducer(x => x + 1, 0);
	return forceUpdate as () => void;
};
