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
	defaultForcefullyFetchFn = defaultProvidedForcefullyFetchFn,
}: {
	resourceKey: DefaultKey;
	dependenciesInfoHook?: DepsInfoHook;
	defaultIsIdentificationKnownFn?: (deps: readonly any[]) => boolean;
	defaultForcefullyFetchFn?: (resource: any) => boolean;
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
		<Data extends DataExt, Deps extends readonly any[]>(
			resource: Data | null | undefined,
			fetch: (
				args: CurrentState<Deps>
			) => undefined | Promise<unknown>,
			isIdentificationKnown: boolean,
			dependencies: Deps
		): ResourceLoading<FinalData<Data>, () => void, any>;
		<Data extends DataExt, Deps extends readonly any[]>(
			resource: Data | null | undefined,
			fetch: (
				args: CurrentState<Deps>
			) => undefined | Promise<unknown>,
			dependencies: Deps
		): ResourceLoading<FinalData<Data>, () => void, any>;
	};

	const useResourceLoading: UseResourceLoading = (<
		DOC extends DataExt,
		Deps extends readonly any[]
	>(...args: any[]
	) => {
		const {
			resource,
			forcefullyFetch,
			fetch,
			isIdentificationKnown: passedIsIdentificationKnown,
			dependencies
		} = decipherUseResourceLoadingArgs<DOC, Deps>(args);

		const [error, setError] = useState<any>(null);
		const forceUpdate = useForceUpdate();

		const resourceRef = useRef(resource);
		resourceRef.current = resource;

		const errorRef = useRef(error);
		errorRef.current = error;

		const fetchRef = useRef(fetch);
		fetchRef.current = fetch;

		const isMountedRef = useMountInfo();

		const depsInfo = useDependenciesInfo(...dependencies);

		const finalForcefullyFetch =
			forcefullyFetch === undefined
				? defaultForcefullyFetchFn
					? defaultForcefullyFetchFn(resource)
					: false
				: forcefullyFetch;
		const forcefullyFetchVersion = usePivotVersion(
			finalForcefullyFetch,
			true
		);

		if (depsInfo.getStableVersion() === 0 && forcefullyFetchVersion === 0) {
			depsInfo.setAsStable();
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
			passedIsIdentificationKnown === undefined
				? defaultIsIdentificationKnownFn
					? defaultIsIdentificationKnownFn(dependencies)
					: true
				: passedIsIdentificationKnown;

		useEffect(() => {
			if (!isIdentificationKnown) return;
			if (!depsInfo.isStableVersion()) {
				getResourceRef.current();
			}
		}, [
			currentVersion,
			isIdentificationKnown,
			forcefullyFetchVersion,
		]);

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

export const createFetchHook = <DefaultKey extends string | null, SetResourceKey extends string | undefined = undefined>({
	resourceKey,
	dependenciesInfoHook = defaultDependenciesInfo,
	defaultIsIdentificationKnownFn,
	dangerouslySetResourceKey: setResourceKey
}: {
	resourceKey: DefaultKey;
	dependenciesInfoHook?: DepsInfoHook;
	defaultIsIdentificationKnownFn?: (deps: readonly any[]) => boolean;
	dangerouslySetResourceKey?: SetResourceKey
}) => {
	const useResourceLoading = createResourceLoadingHook({
		resourceKey: setResourceKey ? null : resourceKey,
		dependenciesInfoHook,
		defaultIsIdentificationKnownFn,
		defaultForcefullyFetchFn: () => true,
	});
	type DataExt = DefaultKey extends string ? any : Record<any, any>;
	type Additional<Data> = SetResourceKey extends string ? { [key in SetResourceKey]: Dispatch<SetStateAction<Data>> } : {};
	type FinalData<Data> = DefaultKey extends string
		? ({ [key in DefaultKey]: Data } & Additional<Data>)
		: (Data & Additional<Data>);

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
		const [rawResource, setRawResource] = useState<any>(undefined);
		let fetchResource: any;
		let rest: any = undefined;
		if (typeof arg === "function") {
			fetchResource = arg;
		} else {
			({ fetchResource, ...rest } = arg);
		}

		const resource = useMemo(() => {
			if (!setResourceKey) return rawResource;
			if (resourceKey === null) return { [setResourceKey as string]: setRawResource, ...rawResource};
			return { [setResourceKey as string]: setRawResource, [resourceKey as string]: rawResource };
		}, [rawResource]);

		return useResourceLoading(
			{
				resource,
				fetch: (...args) => {
					return fetchResource(...args).then(res => {
						if (!args[0].shouldBeCancelled()) {
							setRawResource(res);
						}
					});
				},
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

const usePivotVersion = <T>(value: T, pivotValue: T): number => {
	const version = useRef(0);
	if (value === pivotValue) {
		version.current++;
	}
	return version.current;
};

const defaultProvidedForcefullyFetchFn = (resource: any): boolean => {
	return resource === null || resource === undefined;
};

type SetStateAction<S> = S | ((prevState: S) => S);
type Dispatch<A> = (value: A) => void;


const decipherUseResourceLoadingArgs = <DOC, Deps>(args: any[]) => {
	let resource: DOC | null | undefined;
	let forcefullyFetch: boolean | undefined = undefined;
	let fetch: (args: CurrentState<Deps>) => undefined | Promise<unknown>;
	let isIdentificationKnown: boolean | undefined = undefined;

	if (typeof args[1] === "function") {
		resource = args[0];
		fetch = args[1];
		if (args.length === 4) {
			isIdentificationKnown = !!args[3];
		}
	} else {
		resource = args[0].resource;
		fetch = args[0].fetch;
		forcefullyFetch = args[0].forcefullyFetch;
		if (args.length === 3) {
			isIdentificationKnown = !!args[2];
		}
	}
	const dependencies = args[args.length - 1];
	return { resource, dependencies, fetch, forcefullyFetch, isIdentificationKnown }
}
