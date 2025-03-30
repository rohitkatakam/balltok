import { useState, useCallback, useEffect, useRef } from "react";
import { useLocalization } from "./useLocalization";
import type { WikiArticle } from "../components/WikiCard";

// TODO: Replace these placeholders with actual Wikipedia category names
// e.g., "Category:Active NBA players", "Category:National Football League current players"
const TARGET_CATEGORIES: string[] = [
  "Category:American football",
  // "Category:History of North America",
  // "Category:Applied mathematics",
];

// --- Number of articles to fetch details for in each batch ---
const BATCH_SIZE = 40; // Increased batch size
// --- Number of subcategories to sample and fetch pages from ---
const SUBCAT_SAMPLE_SIZE = 5;

const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve();
    img.onerror = reject;
  });
};

// --- Minimal type for categorymembers API response item ---
type CategoryMember = {
  pageid: number;
  ns: number;
  title: string;
}

// --- Type definition for the list=categorymembers API response ---
type CategoryMembersQuery = {
  categorymembers: CategoryMember[];
}

type ApiContinue = {
  cmcontinue: string;
  continue: string;
}

type ApiError = {
  code: string;
  info: string;
  "*": string; // MediaWiki often uses '*' for additional info
}

type CategoryMembersApiResponse = {
  batchcomplete?: string;
  continue?: ApiContinue;
  query?: CategoryMembersQuery;
  error?: ApiError;
}

// --- Type definition for the page details API response ---
type PageThumbnail = {
  source: string;
  width: number;
  height: number;
}

type PageInfo = {
  pageid: number;
  ns: number;
  title: string;
  extract?: string;
  canonicalurl?: string;
  varianttitles?: Record<string, string>;
  thumbnail?: PageThumbnail;
  // Add other properties if needed based on the API 'prop' parameter
}

type PagesQuery = {
  pages: Record<string, PageInfo>;
}

type PageDetailsApiResponse = {
  batchcomplete?: string;
  query?: PagesQuery;
  error?: ApiError;
}

export function useWikiArticles() {
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [buffer, setBuffer] = useState<WikiArticle[]>([]);
  const { currentLanguage } = useLocalization();

  // --- State for the two-step approach ---
  const categoryPageIds = useRef<Record<string, number[] | null>>({}); // Cache for page IDs
  const categorySubcats = useRef<Record<string, string[] | null>>({}); // Cache for subcat names
  const shownPageIds = useRef<Set<number>>(new Set()); // Global set for shown IDs
  const fetchingStatus = useRef<Record<string, 'pending' | 'done' | 'error'>>({}); // More granular status
  // ----------------------------------------

  // Generic function to fetch category members (pages or subcats)
  const fetchCategoryMembers = useCallback(async <T extends 'page' | 'subcat'>(
    categoryName: string,
    memberType: T
  ): Promise<T extends 'page' ? number[] | null : string[] | null> => {

    const cacheRef = memberType === 'page' ? categoryPageIds : categorySubcats;
    const cacheKey = `${categoryName}-${memberType}`;

    // Return cached data if available and not an error state
    if (cacheRef.current[categoryName] !== undefined && fetchingStatus.current[cacheKey] !== 'error') {
      //@ts-expect-error - TypeScript struggles with conditional return type here
      return cacheRef.current[categoryName];
    }

    // Prevent fetching if already pending
    if (fetchingStatus.current[cacheKey] === 'pending') {
      console.log(`Fetch already pending for ${categoryName} (${memberType})`);
      return null;
    }

    fetchingStatus.current[cacheKey] = 'pending';
    console.log(`Fetching ${memberType}s for ${categoryName}...`);

    let allMembers: (number | string)[] = [];
    let cmcontinue: string | null = null;

    const propToFetch = memberType === 'page' ? 'ids' : 'title';

    try {
      do {
        const params = new URLSearchParams({
          action: "query",
          format: "json",
          list: "categorymembers",
          cmtype: memberType,
          cmtitle: categoryName,
          cmlimit: "500", // Max limit
          cmprop: propToFetch,
          origin: "*",
          ...(cmcontinue && { cmcontinue }), // Add cmcontinue if it exists
        });

        const response = await fetch(`${currentLanguage.api}${params}`);
        const data: CategoryMembersApiResponse = await response.json();

        if (data.error) {
          throw new Error(data.error.info);
        }

        const members = data.query?.categorymembers || [];
        const extractedData = memberType === 'page'
          ? members.map((m: CategoryMember) => m.pageid)
          : members.map((m: CategoryMember) => m.title);

        allMembers = [...allMembers, ...extractedData];
        cmcontinue = data.continue?.cmcontinue || null;

      } while (cmcontinue);

      // Cache the result
      if (memberType === 'page') {
        categoryPageIds.current[categoryName] = allMembers as number[];
      } else {
        categorySubcats.current[categoryName] = allMembers as string[];
      }

      fetchingStatus.current[cacheKey] = 'done';
      console.log(`Fetched ${allMembers.length} ${memberType}s for ${categoryName}.`);

      //@ts-expect-error - Conditional return type
      return allMembers;

    } catch (error) {
      console.error(`Error fetching ${memberType}s for ${categoryName}:`, error);
      fetchingStatus.current[cacheKey] = 'error'; // Mark as error to allow retry
      // Store null in cache to indicate fetch failure for this type
      if (memberType === 'page') {
        categoryPageIds.current[categoryName] = null;
      } else {
        categorySubcats.current[categoryName] = null;
      }
      return null;
    } finally {
      // If status is still pending (e.g., caught error before setting done/error), mark as error
      if (fetchingStatus.current[cacheKey] === 'pending') {
        fetchingStatus.current[cacheKey] = 'error';
      }
    }
  }, [currentLanguage.api]); // Removed other refs from dependencies

  // Step 2: Fetch article details for a given list of page IDs
  const fetchArticleDetails = useCallback(async (pageIds: number[]): Promise<WikiArticle[]> => {
    if (pageIds.length === 0) return [];

    try {
      const response = await fetch(
        currentLanguage.api +
          new URLSearchParams({
            action: "query",
            format: "json",
            pageids: pageIds.join("|"),
            prop: "extracts|info|pageimages",
            inprop: "url|varianttitles",
            exintro: "1",
            exlimit: "max",
            exsentences: "5",
            explaintext: "1",
            piprop: "thumbnail",
            pithumbsize: "800",
            origin: "*",
            variant: currentLanguage.id,
            dummy: Date.now().toString(), // Keep cache-busting
          })
      );
      const data: PageDetailsApiResponse = await response.json(); // Apply specific type

      if (data.error) {
        throw new Error(data.error.info);
      }

      const fetchedArticles = Object.values(data.query?.pages || {})
        .map((page: any): WikiArticle | null => {
          // Basic validation
          if (!page.pageid || !page.title || !page.extract || !page.canonicalurl) {
            return null;
          }
          return {
            title: page.title,
            displaytitle: page.varianttitles?.[currentLanguage.id] ?? page.title,
            extract: page.extract,
            pageid: page.pageid,
            thumbnail: page.thumbnail,
            url: page.canonicalurl,
          };
        })
        .filter((article): article is WikiArticle => article !== null && !!article.thumbnail?.source); // Ensure thumbnail source exists

      // Preload images
      await Promise.allSettled(
        fetchedArticles.map((article) => preloadImage(article.thumbnail!.source))
      );

      return fetchedArticles;

    } catch (error) {
      console.error("Error fetching article details:", error);
      return [];
    }
  }, [currentLanguage.api, currentLanguage.id]);

  // Main orchestration logic
  const fetchAndProcessArticles = useCallback(async (forBuffer = false) => {
    if (loading || TARGET_CATEGORIES.length === 0) return;
    setLoading(true);

    try {
      // --- Start of New Fetch Logic ---
      // 1. Fetch direct pages and subcategories for all TARGET_CATEGORIES
      const initialFetchPromises = TARGET_CATEGORIES.flatMap(catName => [
        fetchCategoryMembers(catName, 'page'),
        fetchCategoryMembers(catName, 'subcat')
      ]);
      await Promise.all(initialFetchPromises);

      // 2. Aggregate direct page IDs and all subcategory names
      const directPageIds: number[] = [];
      const allSubcatNames: string[] = [];
      TARGET_CATEGORIES.forEach(catName => {
        const pages = categoryPageIds.current[catName];
        const subcats = categorySubcats.current[catName];
        if (Array.isArray(pages)) directPageIds.push(...pages);
        if (Array.isArray(subcats)) allSubcatNames.push(...subcats);
      });

      // 3. Sample subcategories
      const uniqueSubcats = [...new Set(allSubcatNames)];
      const sampledSubcats = uniqueSubcats
        .sort(() => 0.5 - Math.random()) // Shuffle
        .slice(0, SUBCAT_SAMPLE_SIZE);

      // 4. Fetch pages for sampled subcategories
      const subcatPageFetchPromises = sampledSubcats.map(subcatName =>
        fetchCategoryMembers(subcatName, 'page')
      );
      await Promise.all(subcatPageFetchPromises);

      // 5. Aggregate page IDs from sampled subcategories
      const subcatPageIds: number[] = [];
      sampledSubcats.forEach(subcatName => {
        const pages = categoryPageIds.current[subcatName]; // Use the same cache
        if (Array.isArray(pages)) subcatPageIds.push(...pages);
      });

      // 6. Combine all page IDs and make unique
      const allAvailableIds = [...new Set([...directPageIds, ...subcatPageIds])];

      if (allAvailableIds.length === 0) {
        console.warn("No page IDs available from target categories or sampled subcategories.");
        setLoading(false);
        return;
      }

      // 7. Select random, *unused* IDs from the combined pool
      let potentialIds = allAvailableIds.filter(id => !shownPageIds.current.has(id));

      // If all available IDs have been shown, reset the shown set
      if (potentialIds.length === 0 && allAvailableIds.length > 0) {
        console.log("All available articles shown. Resetting shown set...");
        shownPageIds.current.clear();
        potentialIds = allAvailableIds; // Use all IDs again
      }

      // Shuffle potential IDs and take a batch
      const shuffledIds = potentialIds.sort(() => 0.5 - Math.random());
      const idsToFetch = shuffledIds.slice(0, BATCH_SIZE);

      if (idsToFetch.length === 0) {
        console.warn("No new IDs to fetch from the combined pool.");
        setLoading(false);
        return;
      }

      // 8. Fetch details for the selected IDs
      const newArticles = await fetchArticleDetails(idsToFetch);

      // 9. Update global shown IDs set and state
      idsToFetch.forEach(id => shownPageIds.current.add(id));

      // --- End of New Fetch Logic ---

      if (newArticles.length > 0) {
        if (forBuffer) {
          setBuffer(newArticles);
        } else {
          setArticles((prev) => [...prev, ...newArticles]);
          // Trigger fetching the next batch for the buffer immediately
          fetchAndProcessArticles(true);
        }
      }
    } catch (error) {
      console.error("Error in fetchAndProcessArticles:", error);
    } finally {
      setLoading(false);
    }
  }, [loading, fetchCategoryMembers, fetchArticleDetails]); // Updated dependencies

  // Adapted function exposed to the component
  const getMoreArticles = useCallback(() => {
    if (buffer.length > 0) {
      setArticles((prev) => [...prev, ...buffer]);
      setBuffer([]);
      fetchAndProcessArticles(true); // Fetch next buffer
    } else {
      // If buffer is empty, fetch directly into articles and then fetch buffer
      fetchAndProcessArticles(false);
    }
  }, [buffer, fetchAndProcessArticles]);

  // Initial fetch on mount
  useEffect(() => {
    fetchAndProcessArticles(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  return { articles, loading, fetchArticles: getMoreArticles };
}
