/**
 * 收藏夹工具 - 基于 localStorage 的页面收藏管理
 */

export interface Bookmark {
  url: string;
  title: string;
  createdAt: number;
}

const STORAGE_KEY = 'bookmarks';

function readAll(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(bookmarks: Bookmark[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

export function getBookmarks(): Bookmark[] {
  return readAll();
}

export function addBookmark(url: string, title: string): Bookmark {
  const bookmarks = readAll();
  const bookmark: Bookmark = { url, title, createdAt: Date.now() };
  bookmarks.unshift(bookmark);
  writeAll(bookmarks);
  return bookmark;
}

export function removeBookmark(url: string): void {
  const bookmarks = readAll().filter((b) => b.url !== url);
  writeAll(bookmarks);
}

export function isBookmarked(url: string): boolean {
  return readAll().some((b) => b.url === url);
}

export function getCurrentPath(): string {
  // HashRouter: hash 部分就是路由路径（包含 query 参数）
  if (window.location.hash && window.location.hash.startsWith('#/')) {
    return window.location.hash.slice(1); // 去掉 #，保留 /xxx?param=value
  }
  // BrowserRouter: pathname + search
  return window.location.pathname + window.location.search;
}
