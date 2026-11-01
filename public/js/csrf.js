// public/js/csrf.js
// Shared CSRF token management.
// Fetches a CSRF token from the server on page load and exposes it
// globally so that every fetch wrapper can include it in state-changing
// requests (POST / PUT / PATCH / DELETE).

'use strict';

(function () {
  /** The cached CSRF token for the current session. */
  window._csrfToken = '';

  /**
   * Fetch (or refresh) the CSRF token from the server.
   * Called automatically on page load; can also be called manually
   * after a 403-CSRF response to retry with a fresh token.
   */
  window.fetchCsrfToken = async function fetchCsrfToken() {
    try {
      const res = await fetch('/api/csrf-token', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        window._csrfToken = data.csrfToken || '';
      }
    } catch (_) {
      // Silently ignore — the server may not be reachable yet.
    }
  };

  /**
   * Return the current CSRF token value.
   * @returns {string}
   */
  window.getCsrfToken = function getCsrfToken() {
    return window._csrfToken;
  };

  // Auto-fetch as soon as the script loads.
  window.fetchCsrfToken();
})();
