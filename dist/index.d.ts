export type TranslationCatalog = Record<string, unknown>;
export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
export type Translator = (key: string | undefined, params?: TranslationParams) => string;
export interface Readable<T> {
    subscribe(run: (value: T) => void, invalidate?: () => void): () => void;
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
export declare const isObject: (item: unknown) => item is TranslationCatalog;
export declare const deepMerge: (target: TranslationCatalog, source: TranslationCatalog) => TranslationCatalog;
export declare const createI18n: (config?: I18nConfig) => I18n;
