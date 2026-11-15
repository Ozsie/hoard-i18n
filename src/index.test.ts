import { describe, expect, it, vi } from 'vitest';
import { createI18n, deepMerge, isObject } from './index';

describe('createI18n', () => {
	it('translates nested keys and interpolates parameters', async () => {
		const i18n = createI18n({
			fallbackLocale: 'en',
			translations: {
				en: { content: { greeting: 'Hello, {{ name }}!' } },
				sv: { content: { greeting: 'Hej, {{name}}!' } },
			},
		});

		expect(i18n.t.get()('content.greeting', { name: 'Ada' })).toBe(
			'Hello, Ada!',
		);
		await i18n.setLocale('sv');
		expect(i18n.t.get()('content.greeting', { name: 'Ada' })).toBe(
			'Hej, Ada!',
		);
		await i18n.setLocale('en');
		expect(i18n.t.get()('content.greeting', { name: 'Ada' })).toBe(
			'Hello, Ada!',
		);
	});

	it('loads and merges namespace loaders once and updates Svelte stores', async () => {
		const loadCampaign = vi.fn(async () => ({ title: 'The Quest' }));
		const i18n = createI18n({
			fallbackLocale: 'en',
			translations: { en: { lang: { en: 'English' } } },
			loaders: [
				{ locale: 'en', key: 'campaign', loader: loadCampaign },
			],
		});
		const observedLocales: string[] = [];
		const unsubscribe = i18n.locale.subscribe((value) =>
			observedLocales.push(value),
		);

		await i18n.loadTranslations('en');
		await i18n.loadTranslations('en');

		expect(i18n.t.get()('campaign.title')).toBe('The Quest');
		expect(i18n.t.get()('lang.en')).toBe('English');
		expect(loadCampaign).toHaveBeenCalledTimes(1);
		expect(observedLocales).toEqual(['en']);
		expect(i18n.loading.get()).toBe(false);
		unsubscribe();
	});

	it('uses fallback messages and returns missing keys unchanged', async () => {
		const i18n = createI18n({
			fallbackLocale: 'en',
			translations: { en: { greeting: 'Hello {{name}}' }, sv: {} },
		});

		await i18n.setLocale('sv');
		expect(i18n.t.get()('greeting', { name: 'Ada' })).toBe('Hello Ada');
		expect(i18n.t.get()('missing.key')).toBe('missing.key');
		expect(i18n.t.get()('greeting')).toBe('Hello ');
		expect(i18n.t.get()(undefined)).toBe('');
	});
});

describe('catalog helpers', () => {
	it('deep merges nested objects and recognizes only objects', () => {
		expect(deepMerge({ group: { first: 'one' } }, { group: { second: 'two' } })).toEqual({
			group: { first: 'one', second: 'two' },
		});
		expect(isObject({})).toBe(true);
		expect(isObject([])).toBe(false);
		expect(isObject(null)).toBe(false);
	});
});