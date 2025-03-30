import React, { useState } from 'react';
import { useCategorySearch } from '../hooks/useCategorySearch';

/**
 * Temporary component solely for testing the useCategorySearch hook.
 */
export function CategorySearchTester(): React.ReactElement {
    const [inputValue, setInputValue] = useState<string>('Sports'); // Default search term
    const { searchResults, loading, error, searchCategories } = useCategorySearch();

    const handleSearch = () => {
        console.log(`--- Triggering search for: "${inputValue}" ---`);
        searchCategories(inputValue);
    };

    return (
        <div style={{ padding: '20px', border: '2px solid blue', margin: '20px', fontFamily: 'sans-serif' }}>
            <h2>Category Search Hook Tester</h2>
            <div>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Enter category search term"
                    style={{ padding: '8px', marginRight: '10px' }}
                    disabled={loading}
                />
                <button onClick={handleSearch} disabled={loading} style={{ padding: '8px' }}>
                    {loading ? 'Searching...' : 'Search Categories'}
                </button>
            </div>

            {error && (
                <div style={{ marginTop: '15px', color: 'red' }}>
                    <p><strong>Error:</strong> {error}</p>
                </div>
            )}

            {searchResults.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                    <p><strong>Results:</strong></p>
                    <ul style={{ listStyle: 'disc', paddingLeft: '20px' }}>
                        {searchResults.map((category) => (
                            <li key={category}>{category}</li>
                        ))}
                    </ul>
                </div>
            )}

            {loading && <p style={{ marginTop: '15px' }}>Loading results...</p>}

            {!loading && !error && searchResults.length === 0 && inputValue && (
                <p style={{ marginTop: '15px' }}>No results found for "{inputValue}".</p>
            )}
        </div>
    );
}
