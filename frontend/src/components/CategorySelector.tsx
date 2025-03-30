import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCategorySearch } from '../hooks/useCategorySearch';
import { X } from 'lucide-react'; // For the remove button

interface CategorySelectorProps {
  onCategoriesSelected: (categories: string[]) => void;
}

// Debounce utility hook (using useRef and useCallback internally)
function useDebounce<F extends (...args: any[]) => Promise<any> | void>(
  func: F,
  waitFor: number
): (...args: Parameters<F>) => Promise<ReturnType<F> | void> {
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Store the latest func reference
  const funcRef = useRef<F>(func);
  useEffect(() => {
    funcRef.current = func;
  }, [func]);

  // Cleanup function ref
  const cleanupRef = useRef(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  });

  // Effect for component unmount cleanup
  useEffect(() => {
    return () => {
      cleanupRef.current(); // Clear any pending timeout on unmount
    };
  }, []);

  return useCallback((...args: Parameters<F>): Promise<ReturnType<F> | void> => {
    return new Promise((resolve) => {
      cleanupRef.current(); // Clear previous timeout

      timeoutIdRef.current = setTimeout(async () => {
        try {
          // Call the latest func reference
          const result = await funcRef.current(...args);
          resolve(result);
        } catch (error) {
          console.error("Debounced function execution error:", error);
          // Decide how to handle errors, maybe resolve with a specific value or rethrow
          // resolve(undefined); // Example: resolve with undefined on error
        }
      }, waitFor);
    });
  }, [waitFor]); // Dependency is just waitFor
}


/**
 * A UI component allowing users to search for and select Wikipedia categories.
 */
export function CategorySelector({ onCategoriesSelected }: CategorySelectorProps): React.ReactElement {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [chosenCategories, setChosenCategories] = useState<string[]>([]);
  const {
    searchResults: apiSearchResults,
    loading: searchLoading,
    error: searchError,
    searchCategories
  } = useCategorySearch();

  // Debounce the search API call using the custom hook
  const debouncedSearchCategories = useDebounce(searchCategories, 350);

  // Filter out already chosen categories from search results
  const filteredSearchResults = apiSearchResults.filter(
    cat => !chosenCategories.includes(cat)
  );

  // Effect to trigger debounced search when searchTerm changes
  useEffect(() => {
    if (searchTerm.trim()) {
        // We don't need to await here, the hook handles the async nature
        debouncedSearchCategories(searchTerm.trim());
    } else {
      // Optionally clear results instantly if search term is empty
      // This might be better handled within useCategorySearch itself
      // e.g., searchCategories('') could clear results.
      // For now, let's assume useCategorySearch handles empty strings gracefully.
    }
    // Note: No need to return cleanup here, useDebounce handles it.
  }, [searchTerm, debouncedSearchCategories]);

  const handleAddCategory = (category: string): void => {
    if (!chosenCategories.includes(category)) {
      setChosenCategories(prev => [...prev, category]);
      // Optional: Clear search term after adding might improve UX
      // setSearchTerm('');
    }
  };

  const handleRemoveCategory = (categoryToRemove: string): void => {
    setChosenCategories(prev => prev.filter(cat => cat !== categoryToRemove));
  };

  const handleConfirm = (): void => {
    if (chosenCategories.length > 0) {
      onCategoriesSelected(chosenCategories);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-gray-900 text-white p-6 rounded-lg w-full max-w-lg shadow-xl flex flex-col max-h-[80vh]">
        <h2 className="text-xl font-bold mb-4">Select Categories</h2>
        <p className="text-sm text-white/70 mb-4">Search for Wikipedia categories to add to your feed. You must select at least one.</p>

        {/* Search Input */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search categories (e.g., Technology, History)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={searchLoading} // Disable input while loading
          />
          {searchLoading && <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-white/50">Loading...</span>}
        </div>
        {searchError && <p className="text-red-500 text-sm mb-2">Error: {searchError}</p>}

        {/* Search Results Area (Scrollable) */}
        <div className="mb-4 overflow-y-auto min-h-[80px] max-h-[200px] bg-gray-800/50 rounded p-2 border border-gray-700">
          {searchTerm && filteredSearchResults.length > 0 && (
              <ul className="space-y-1">
                {filteredSearchResults.map((category) => (
                  <li
                    key={category}
                    onClick={() => handleAddCategory(category)}
                    className="p-2 hover:bg-gray-700 cursor-pointer rounded text-sm"
                  >
                    {category}
                  </li>
                ))}
              </ul>
          )}
          {/* Display message when search has run but found nothing */}
          {searchTerm && !searchLoading && apiSearchResults.length === 0 && (
              <p className="text-sm text-white/60 p-2">No results found for '{searchTerm}'.</p>
          )}
           {/* Display placeholder/instruction when input is empty or hasn't yielded results yet */}
          {!searchTerm && (
              <p className="text-sm text-white/50 p-2">Type above to search for categories.</p>
          )}
        </div>


        {/* Selected Categories */}
        {chosenCategories.length > 0 && (
          <div className="mb-4 pt-2 border-t border-gray-700">
            <h3 className="text-md font-semibold mb-2">Selected:</h3>
            <ul className="flex flex-wrap gap-2">
              {chosenCategories.map((category) => (
                <li
                  key={category}
                  className="flex items-center bg-blue-600/30 text-blue-100 px-2 py-1 rounded-full text-sm whitespace-nowrap"
                >
                  <span>{category}</span>
                  <button
                    onClick={() => handleRemoveCategory(category)}
                    className="ml-1.5 text-blue-200 hover:text-white p-0.5 rounded-full hover:bg-white/20"
                    aria-label={`Remove ${category}`}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Spacer to push button down if content is short */}
        <div className="flex-grow"></div>

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={chosenCategories.length === 0 || searchLoading}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-semibold transition-colors flex-shrink-0"
        >
          Confirm Selection & Load Feed
        </button>

      </div>
    </div>
  );
}

// --- Type Check for NodeJS.Timeout ---
// This ensures the type is available. If you're in a pure browser environment
// without Node types, you might use `ReturnType<typeof setTimeout>` instead.
declare global {
    namespace NodeJS {
        type Timeout = ReturnType<typeof setTimeout>;
    }
}