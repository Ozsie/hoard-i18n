export type TranslationCatalog = Record<string, unknown>;
export type TranslationParams = Record<
	string,
	string | number | boolean | null | undefined
>;
export type Translator = (
	key: string | undefined,
	params?: TranslationParams,
) => string;

export interface Readable<T> {
	subscribe(
		run: (value: T) => void,
		invalidate?: () => void,
	): () => void;
	get(): T;
}

export interface Writable<T> extends Readable<T> {
	set(value: T): void;
	update(updater: (value: T) => T): void;
}

export interface TranslationLoader {
	locale: string;
	key: string;
	loader: () => Promise<TranslationCatalog>;
}

export interface I18nConfig {
	translations?: Record<string, TranslationCatalog>;
	loaders?: TranslationLoader[];
	fallbackLocale?: string;
	initialLocale?: string;
}

export interface I18n {
	t: Readable<Translator>;
	loading: Readable<boolean>;
	locales: Readable<string[]>;
	locale: Writable<string>;
	loadTranslations(locale: string): Promise<void>;
	setLocale(locale: string): Promise<void>;
}

export const isObject = (item: unknown): item is TranslationCatalog =>
	typeof item === 'object' && item !== null && !Array.isArray(item);

export const deepMerge = (
	target: TranslationCatalog,
	source: TranslationCatalog,
): TranslationCatalog => {
	const result: TranslationCatalog = { ...target };
	for (const [key, value] of Object.entries(source)) {
		if (isObject(value) && isObject(result[key])) {
			result[key] = deepMerge(result[key], value);
		} else {
			result[key] = value;
		}
	}
	return result;
};

const writable = <T>(initialValue: T): Writable<T> => {
	let value = initialValue;
	const subscribers = new Set<{
		run: (value: T) => void;
		invalidate?: () => void;
	}>();
	const set = (nextValue: T) => {
		if (Object.is(value, nextValue)) return;
		value = nextValue;
		for (const subscriber of [...subscribers]) subscriber.invalidate?.();
		for (const subscriber of [...subscribers]) subscriber.run(value);
	};
	return {
		subscribe(run, invalidate) {
			const subscriber = { run, invalidate };
			subscribers.add(subscriber);
			run(value);
			return () => {
				subscribers.delete(subscriber);
			};
		},
		get: () => value,
		set,
		update(updater) {
			set(updater(value));
		},
	};
};

const getPath = (catalog: TranslationCatalog, key: string): unknown =>
	key.split('.').reduce<unknown>((value, part) => {
		if (!isObject(value) || !Object.hasOwn(value, part)) return undefined;
		return value[part];
	}, catalog);

const interpolate = (message: string, params?: TranslationParams): string =>
	message.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (placeholder, key: string) => {
		const value = params?.[key];
		return value === undefined || value === null ? '' : String(value);
	});

export const createI18n = (config: I18nConfig = {}): I18n => {
	const loaders = config.loaders ?? [];
	const supportedLocales = [
		...new Set([
			...Object.keys(config.translations ?? {}),
			...loaders.map(({ locale }) => locale),
		]),
	];
	const fallbackLocale =
		config.fallbackLocale ?? supportedLocales[0] ?? '';
	const initialLocale = config.initialLocale ?? fallbackLocale;
	const catalogs = new Map<string, TranslationCatalog>(
		Object.entries(config.translations ?? {}),
	);
	const loadedLocales = new Set<string>();
	const pendingLoads = new Map<string, Promise<void>>();
	const locale = writable(initialLocale);
	const loading = writable(false);
	const locales = writable(supportedLocales);
	let pendingCount = 0;
	let latestRequest = 0;

	const translate: Translator = (key, params) => {
		if (typeof key !== 'string') return '';
		const currentMessage = getPath(catalogs.get(locale.get()) ?? {}, key);
		const fallbackMessage = getPath(catalogs.get(fallbackLocale) ?? {}, key);
		const message =
			typeof currentMessage === 'string'
				? currentMessage
				: typeof fallbackMessage === 'string'
					? fallbackMessage
					: key;
		return interpolate(message, params);
	};

	const t = writable(translate);
	const publishTranslations = () => t.set((key, params) => translate(key, params));

	const loadLocale = (targetLocale: string): Promise<void> => {
		if (loadedLocales.has(targetLocale)) return Promise.resolve();
		const pending = pendingLoads.get(targetLocale);
		if (pending) return pending;

		pendingCount += 1;
		loading.set(true);
		const task = Promise.all(
			loaders
				.filter(({ locale: loaderLocale }) => loaderLocale === targetLocale)
				.map(async ({ key, loader }) => ({
					key,
					catalog: await loader(),
				})),
		)
			.then((loadedNamespaces) => {
				let catalog = catalogs.get(targetLocale) ?? {};
				for (const { key, catalog: loadedCatalog } of loadedNamespaces) {
					catalog = deepMerge(catalog, { [key]: loadedCatalog });
				}
				catalogs.set(targetLocale, catalog);
				loadedLocales.add(targetLocale);
			})
			.finally(() => {
				pendingCount -= 1;
				loading.set(pendingCount > 0);
				pendingLoads.delete(targetLocale);
			});
		pendingLoads.set(targetLocale, task);
		return task;
	};

	const loadTranslations = async (targetLocale: string): Promise<void> => {
		const request = ++latestRequest;
		await loadLocale(targetLocale);
		if (request === latestRequest) {
			locale.set(targetLocale);
			publishTranslations();
		}
	};

	return {
		t,
		loading,
		locales,
		locale,
		loadTranslations,
		setLocale: loadTranslations,
	};
};