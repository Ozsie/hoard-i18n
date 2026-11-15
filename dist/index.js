export const isObject = (item) => typeof item === 'object' && item !== null && !Array.isArray(item);
export const deepMerge = (target, source) => {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (isObject(value) && isObject(result[key])) {
            result[key] = deepMerge(result[key], value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
};
const writable = (initialValue) => {
    let value = initialValue;
    const subscribers = new Set();
    const set = (nextValue) => {
        if (Object.is(value, nextValue))
            return;
        value = nextValue;
        for (const subscriber of [...subscribers])
            subscriber.invalidate?.();
        for (const subscriber of [...subscribers])
            subscriber.run(value);
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
const getPath = (catalog, key) => key.split('.').reduce((value, part) => {
    if (!isObject(value) || !Object.hasOwn(value, part))
        return undefined;
    return value[part];
}, catalog);
const interpolate = (message, params) => message.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (placeholder, key) => {
    const value = params?.[key];
    return value === undefined || value === null ? '' : String(value);
});
export const createI18n = (config = {}) => {
    const loaders = config.loaders ?? [];
    const supportedLocales = [
        ...new Set([
            ...Object.keys(config.translations ?? {}),
            ...loaders.map(({ locale }) => locale),
        ]),
    ];
    const fallbackLocale = config.fallbackLocale ?? supportedLocales[0] ?? '';
    const initialLocale = config.initialLocale ?? fallbackLocale;
    const catalogs = new Map(Object.entries(config.translations ?? {}));
    const loadedLocales = new Set();
    const pendingLoads = new Map();
    const locale = writable(initialLocale);
    const loading = writable(false);
    const locales = writable(supportedLocales);
    let pendingCount = 0;
    let latestRequest = 0;
    const translate = (key, params) => {
        if (typeof key !== 'string')
            return '';
        const currentMessage = getPath(catalogs.get(locale.get()) ?? {}, key);
        const fallbackMessage = getPath(catalogs.get(fallbackLocale) ?? {}, key);
        const message = typeof currentMessage === 'string'
            ? currentMessage
            : typeof fallbackMessage === 'string'
                ? fallbackMessage
                : key;
        return interpolate(message, params);
    };
    const t = writable(translate);
    const publishTranslations = () => t.set((key, params) => translate(key, params));
    const loadLocale = (targetLocale) => {
        if (loadedLocales.has(targetLocale))
            return Promise.resolve();
        const pending = pendingLoads.get(targetLocale);
        if (pending)
            return pending;
        pendingCount += 1;
        loading.set(true);
        const task = Promise.all(loaders
            .filter(({ locale: loaderLocale }) => loaderLocale === targetLocale)
            .map(async ({ key, loader }) => ({
            key,
            catalog: await loader(),
        })))
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
    const loadTranslations = async (targetLocale) => {
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
