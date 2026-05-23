import './styles.css';
export { initHuskel, getHuskelClient, HuskelClient } from './client';
export { HuskelAPI } from './api';
export { useHuskel } from './hooks/useHuskel';
export { useSearch } from './hooks/useSearch';
export { useIngest } from './hooks/useIngest';
export { usePageIngest } from './hooks/usePageIngest';
export { useChat } from './hooks/useChat';
export { useCart } from './hooks/useCart';
export type { ChatMessage, ChatSource } from './hooks/useChat';
export { SearchBar } from './components/SearchBar';
export { Sparkle } from './components/Sparkle';
export { ChatWidget } from './components/ChatWidget';
export { AIChatButton } from './components/AIChatButton';
export { CartBadge } from './components/CartBadge';
export { CartDrawer } from './components/CartDrawer';
export { HuskelProvider } from './components/HuskelProvider';
export type {
  Product,
  RawProductInput,
  HuskelConfig,
  SearchRequest,
  SearchResult,
  SearchResponse,
  IngestResponse,
  HuskelError,
} from './types';
