import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axiosInstance';
import ProductCard from '../../components/ProductCard';
import {
  Search,
  Layers,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Grid,
} from 'lucide-react';

const CategoryRow = ({ catName, items, onSelectCategory }) => {
  const scrollRef = useRef(null);

  const handleScroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -340 : 340;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Category Header with Counter & View All Button */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-5 bg-blue-600 rounded-full inline-block"></span>
            {catName}
          </h2>
          <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2.5 py-0.5 rounded-full">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectCategory(catName)}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Carousel Arrows (Visible when items > 3) */}
          {items.length > 3 && (
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-gray-200">
              <button
                onClick={() => handleScroll('left')}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                title="Scroll Left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleScroll('right')}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                title="Scroll Right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Scroll Track */}
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto pb-4 pt-1 scrollbar-none scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((prod) => (
          <div
            key={prod.id}
            className="w-[280px] sm:w-[300px] flex-shrink-0 flex flex-col"
          >
            <ProductCard product={prod} />
          </div>
        ))}
      </div>
    </div>
  );
};

const Catalog = () => {
  const [allProducts, setAllProducts] = useState([]);
  const [displayedProducts, setDisplayedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch products
  const fetchProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/user/getProducts');
      if (res.data.success) {
        const prods = res.data.products || [];
        setAllProducts(prods);
        setDisplayedProducts(prods);

        const distinctCategories = Array.from(
          new Set(prods.map((p) => p.category_name).filter(Boolean))
        );
        setCategories(distinctCategories);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Filter products by category
  const handleCategorySelect = (categoryName) => {
    setSelectedCategory(categoryName);
    setSearchQuery('');

    if (categoryName === 'ALL') {
      setDisplayedProducts(allProducts);
    } else {
      setDisplayedProducts(
        allProducts.filter(
          (p) => p.category_name?.toLowerCase() === categoryName.toLowerCase()
        )
      );
    }
  };

  // Search products
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      handleCategorySelect('ALL');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/user/products/${encodeURIComponent(searchQuery.trim())}`);
      if (res.data.success) {
        setDisplayedProducts(res.data.products || []);
        setSelectedCategory('SEARCH_RESULTS');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  // Group products by category when "ALL" is selected
  const groupedProducts = displayedProducts.reduce((acc, item) => {
    const group = item.category_name || 'General Equipment';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Search & Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cameras, laptops, tools, accessories..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
          >
            Search
          </button>
        </form>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none font-semibold">
          <button
            onClick={() => handleCategorySelect('ALL')}
            className={`px-3.5 py-1.5 rounded-full transition whitespace-nowrap ${
              selectedCategory === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Categories
          </button>
          {categories.map((catName) => (
            <button
              key={catName}
              onClick={() => handleCategorySelect(catName)}
              className={`px-3.5 py-1.5 rounded-full transition whitespace-nowrap ${
                selectedCategory === catName
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {catName}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-gray-500 text-xs">Loading available rental inventory...</p>
        </div>
      ) : displayedProducts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-800">No products found</h3>
          <p className="text-xs text-gray-500 mt-1">Try switching categories or searching with different keywords.</p>
        </div>
      ) : selectedCategory === 'ALL' ? (
        /* Single Horizontal Carousel Row per Category */
        <div className="space-y-12">
          {Object.entries(groupedProducts).map(([catName, items]) => (
            <CategoryRow
              key={catName}
              catName={catName}
              items={items}
              onSelectCategory={handleCategorySelect}
            />
          ))}
        </div>
      ) : (
        /* Full Grid Layout for Selected Category or Search Results */
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-6 bg-blue-600 rounded-full inline-block"></span>
                {selectedCategory === 'SEARCH_RESULTS'
                  ? `Search Results for "${searchQuery}"`
                  : `${selectedCategory} Collection`}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Showing all {displayedProducts.length} available rental items
              </p>
            </div>

            <button
              onClick={() => handleCategorySelect('ALL')}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-blue-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Back to Overview (Carousels)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {displayedProducts.map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Catalog;