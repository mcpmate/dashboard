import { useEffect } from "react";
import { loadPageTranslations } from "./index";

export const usePageTranslations = (
	page: keyof typeof loadPageTranslations,
) => {
	useEffect(() => {
		loadPageTranslations[page]();
	}, [page]);
};
