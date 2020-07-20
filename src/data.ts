export type ResourceLoading<
	DOC extends Record<any, any>,
	LoadFunc extends ((...args: any) => any) | undefined = () => void,
	ErrorType = any
> = (
	| ({
			isSuccessfullyLoaded: true;
			isIdentificationKnown: true;
			hasFoundError: false;
			error?: undefined;
	  } & DOC)
	| ({
			isSuccessfullyLoaded: false;
			hasFoundError: false;
			isIdentificationKnown: boolean;
			error?: undefined;
	  } & Record<keyof DOC, undefined>)
	| ({
			isSuccessfullyLoaded: false;
			hasFoundError: true;
			isIdentificationKnown: true;
			error: ErrorType;
	  } & Record<keyof DOC, undefined>)
) & { loadAgain: LoadFunc };

export function getResourceLoadingInfo<
	DOC extends Record<any, any>,
	LoadFunc extends ((...args: any) => any) | undefined = () => void,
	ErrorType = any
>({
	resource,
	error,
	loadAgain,
	isIdentificationKnown,
}: {
	resource: DOC | null | undefined;
	error: ErrorType;
	loadAgain: LoadFunc;
	isIdentificationKnown: boolean;
}): ResourceLoading<DOC, LoadFunc, ErrorType> {
	if (resource) {
		return {
			isSuccessfullyLoaded: true,
			isIdentificationKnown: true,
			hasFoundError: false,
			...({ loadAgain } as any),
			...resource,
		};
	}
	if (error) {
		return {
			isSuccessfullyLoaded: false,
			hasFoundError: true,
			error,
			isIdentificationKnown: true,
			...({ loadAgain } as any),
		} as Extract<
			ResourceLoading<DOC, LoadFunc, ErrorType>,
			{ hasFoundError: true }
		>;
	}
	return {
		isSuccessfullyLoaded: false,
		hasFoundError: false,
		isIdentificationKnown,
		...({ loadAgain } as any),
	} as Extract<
		ResourceLoading<DOC, LoadFunc, ErrorType>,
		{ isSuccessfullyLoaded: false }
	>;
}
