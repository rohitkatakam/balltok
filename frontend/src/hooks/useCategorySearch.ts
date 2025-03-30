import { useState, useCallback } from 'react';
import { useLocalization } from './useLocalization';

// --- Types for MediaWiki Search API Response ---
type WikiCategorySearchResult = {
    ns: number;
    title: string;
    pageid: number;
    size: number;
    wordcount: number;
    snippet: string;
    timestamp: string;
}

type WikiCategorySearchQuery = {
    searchinfo: { totalhits: number };
    search: WikiCategorySearchResult[];
}

type ApiError = {
    code: string;
    info: string;
    "*": string;
}

type WikiCategorySearchResponse = {
    batchcomplete: string;
    continue?: { sroffset: number; continue: string };
    query?: WikiCategorySearchQuery;
    error?: ApiError;
}
// ----------------------------------------------

interface UseCategorySearchResult {
    searchResults: string[];
    loading: boolean;
    error: string | null;
    searchCategories: (query: string) => Promise<void>;
}

/**
 * Custom hook to search for Wikipedia categories.
 * Uses the MediaWiki API with list=search in the Category namespace (14).
 */
export function useCategorySearch(): UseCategorySearchResult {
    const [searchResults, setSearchResults] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const { currentLanguage } = useLocalization();

    const searchCategories = useCallback(async (query: string): Promise<void> => {
        if (!query.trim()) {
            setSearchResults([]); // Clear results if query is empty
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: query,
            srnamespace: '14', // Category namespace
            srlimit: '15', // Limit results slightly more
            origin: '*',
        });

        try {
            const response = await fetch(`${currentLanguage.api}${params}`);
            const data: WikiCategorySearchResponse = await response.json();

            if (data.error) {
                throw new Error(`API Error: ${data.error.info} [${data.error.code}]`);
            }

            const categoryTitles = data.query?.search?.map(item => item.title) || [];
            setSearchResults(categoryTitles);

        } catch (err) {
            console.error("Category search failed:", err);
            setError(err instanceof Error ? err.message : 'Failed to fetch categories.');
            setSearchResults([]); // Clear results on error
        } finally {
            setLoading(false);
        }
    }, [currentLanguage.api]);

    return {
        searchResults,
        loading,
        error,
        searchCategories,
    };
}
