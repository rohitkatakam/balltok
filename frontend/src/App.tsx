import { useEffect, useRef, useCallback, useState } from "react";
import { WikiCard } from "./components/WikiCard";
import { Loader2 } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { useWikiArticles } from "./hooks/useWikiArticles";
import { CategorySelector } from "./components/CategorySelector";

function App(): React.ReactElement {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { articles, loading, fetchArticles } = useWikiArticles(selectedCategories);
  const observerTarget = useRef(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && !loading && articles.length > 0) {
        fetchArticles();
      }
    },
    [loading, articles.length, fetchArticles]
  );

  useEffect(() => {
    const currentObserverTarget = observerTarget.current;
    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0.1,
      rootMargin: "100px",
    });

    if (currentObserverTarget) {
      observer.observe(currentObserverTarget);
    }

    return () => {
      if (currentObserverTarget) {
        observer.unobserve(currentObserverTarget);
      }
      observer.disconnect();
    };
  }, [handleObserver]);

  return (
    <div className="h-screen w-full bg-black text-white overflow-y-scroll snap-y snap-mandatory hide-scroll">
      {/* Show Category Selector if no categories are chosen yet */}
      {selectedCategories.length === 0 ? (
        <CategorySelector onCategoriesSelected={setSelectedCategories} />
      ) : (
        /* Render main app content only AFTER categories are selected */
        <>
          <div className="fixed top-4 left-4 z-50">
            <button
              onClick={() => window.location.reload()}
              className="text-2xl font-bold text-white drop-shadow-lg hover:opacity-80 transition-opacity"
            >
              WikiTok-Focused
            </button>
          </div>

          <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
          </div>

          {/* Show full-screen loading if loading AND no articles yet */}
          {loading && articles.length === 0 && (
            <div className="h-screen w-full flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading Articles...</span>
            </div>
          )}
          {/* Show articles if available */}
          {articles.length > 0 &&
            articles.map((article) => (
              <WikiCard key={article.pageid} article={article} />
            ))}
          {/* Observer target for infinite scroll */}
          <div ref={observerTarget} className="h-10" />
          {/* Show small loading indicator at bottom if loading more AND articles exist */}
          {loading && articles.length > 0 && (
            <div className="h-20 w-full flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading More...</span>
            </div>
          )}
          <Analytics />
        </>
      )}
    </div>
  );
}

export default App;
