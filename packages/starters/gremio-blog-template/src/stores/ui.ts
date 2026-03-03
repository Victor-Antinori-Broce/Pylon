/**
 * UI State Store (Nanostores-compatible simple reactive store)
 * Shares state between Astro and Vue Islands
 */
import { ref } from "vue";

// Search modal
export const isSearchOpen = ref(false);
export function toggleSearch() { isSearchOpen.value = !isSearchOpen.value; }
export function openSearch() { isSearchOpen.value = true; }
export function closeSearch() { isSearchOpen.value = false; }

// Mobile nav
export const isMobileNavOpen = ref(false);
export function toggleMobileNav() { isMobileNavOpen.value = !isMobileNavOpen.value; }
export function closeMobileNav() { isMobileNavOpen.value = false; }
