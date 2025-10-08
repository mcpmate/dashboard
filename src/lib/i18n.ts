import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { resources, type SupportedI18nCode } from "./i18n/resources";

export const SUPPORTED_LANGUAGES = [
	{ store: "en", i18n: "en" as SupportedI18nCode, fallback: "English" },
	{ store: "zh-cn", i18n: "zh-CN" as SupportedI18nCode, fallback: "简体中文" },
	{ store: "ja", i18n: "ja-JP" as SupportedI18nCode, fallback: "日本語" },
] as const;

const FALLBACK_LANGUAGE: SupportedI18nCode = "en";

export function resolveI18nLanguage(language?: string): SupportedI18nCode {
	if (!language) return FALLBACK_LANGUAGE;
	const lower = language.toLowerCase();
	if (lower.startsWith("zh")) {
		return "zh-CN";
	}
	if (lower.startsWith("ja")) {
		return "ja-JP";
	}
	return "en";
}

const initPromise = i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: FALLBACK_LANGUAGE,
		supportedLngs: Object.keys(resources),
		interpolation: { escapeValue: false },
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
		},
	});

export async function ensureI18n() {
	await initPromise;
	return i18n;
}

export { i18n };
