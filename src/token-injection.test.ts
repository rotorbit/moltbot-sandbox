import { describe, it, expect } from 'vitest';

/**
 * Test helper to simulate the injectTokenScript function.
 * This duplicates the logic from index.ts for testing purposes.
 */
async function injectTokenScript(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') || '';
  
  // Only inject into HTML responses
  if (!contentType.includes('text/html')) {
    return response;
  }
  
  // Read the HTML body
  const html = await response.text();
  
  // The script to inject
  const tokenScript = `
<script>
(function() {
  const STORAGE_KEY = 'moltbot_gateway_token';
  
  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }
  
  function saveToken(token) {
    if (token) {
      try { localStorage.setItem(STORAGE_KEY, token); } catch (e) {}
    }
  }
  
  function getSavedToken() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  
  // Save token if in URL
  const urlToken = getTokenFromUrl();
  if (urlToken) {
    saveToken(urlToken);
  } else {
    // Restore token from storage if not in URL
    const savedToken = getSavedToken();
    if (savedToken) {
      const url = new URL(window.location.href);
      url.searchParams.set('token', savedToken);
      window.history.replaceState({}, '', url.toString());
    }
  }
  
  // Make token available globally for WebSocket connections
  window.getMoltbotToken = function() {
    return getTokenFromUrl() || getSavedToken();
  };
})();
</script>`;
  
  // Try to inject before </head>, otherwise before </body>
  let modifiedHtml: string;
  if (html.includes('</head>')) {
    modifiedHtml = html.replace('</head>', `${tokenScript}\n</head>`);
  } else if (html.includes('</body>')) {
    modifiedHtml = html.replace('</body>', `${tokenScript}\n</body>`);
  } else {
    // No suitable injection point, return original content as new Response
    const newHeaders = new Headers(response.headers);
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
  
  // Create new response with modified HTML
  const newHeaders = new Headers(response.headers);
  return new Response(modifiedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

describe('injectTokenScript', () => {
  it('injects script into HTML response with </head> tag', async () => {
    const htmlContent = '<html><head><title>Test</title></head><body>Content</body></html>';
    const response = new Response(htmlContent, {
      headers: { 'content-type': 'text/html' },
    });

    const result = await injectTokenScript(response);
    const resultHtml = await result.text();

    expect(resultHtml).toContain('window.getMoltbotToken');
    expect(resultHtml).toContain('moltbot_gateway_token');
    expect(resultHtml).toContain('</head>');
    // Script should be injected before </head>
    expect(resultHtml.indexOf('getMoltbotToken')).toBeLessThan(resultHtml.indexOf('</head>'));
  });

  it('injects script before </body> if no </head> tag exists', async () => {
    const htmlContent = '<html><body>Content</body></html>';
    const response = new Response(htmlContent, {
      headers: { 'content-type': 'text/html' },
    });

    const result = await injectTokenScript(response);
    const resultHtml = await result.text();

    expect(resultHtml).toContain('window.getMoltbotToken');
    expect(resultHtml).toContain('</body>');
    // Script should be injected before </body>
    expect(resultHtml.indexOf('getMoltbotToken')).toBeLessThan(resultHtml.indexOf('</body>'));
  });

  it('does not inject into non-HTML responses', async () => {
    const jsonContent = '{"test": "data"}';
    const response = new Response(jsonContent, {
      headers: { 'content-type': 'application/json' },
    });

    const result = await injectTokenScript(response);
    const resultText = await result.text();

    expect(resultText).toBe(jsonContent);
    expect(resultText).not.toContain('getMoltbotToken');
  });

  it('does not inject if no suitable HTML tag is found', async () => {
    const htmlContent = '<div>Some content</div>';
    const response = new Response(htmlContent, {
      headers: { 'content-type': 'text/html' },
    });

    const result = await injectTokenScript(response);
    const resultText = await result.text();

    expect(resultText).toBe(htmlContent);
    expect(resultText).not.toContain('getMoltbotToken');
  });

  it('preserves response status and headers', async () => {
    const htmlContent = '<html><head></head><body></body></html>';
    const response = new Response(htmlContent, {
      status: 200,
      statusText: 'OK',
      headers: { 
        'content-type': 'text/html',
        'x-custom-header': 'test-value'
      },
    });

    const result = await injectTokenScript(response);

    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.headers.get('content-type')).toBe('text/html');
    expect(result.headers.get('x-custom-header')).toBe('test-value');
  });

  it('includes token persistence logic in injected script', async () => {
    const htmlContent = '<html><head></head><body></body></html>';
    const response = new Response(htmlContent, {
      headers: { 'content-type': 'text/html' },
    });

    const result = await injectTokenScript(response);
    const resultHtml = await result.text();

    // Check for key functionality
    expect(resultHtml).toContain('getTokenFromUrl');
    expect(resultHtml).toContain('saveToken');
    expect(resultHtml).toContain('getSavedToken');
    expect(resultHtml).toContain('localStorage.setItem(STORAGE_KEY, token)');
    expect(resultHtml).toContain('localStorage.getItem(STORAGE_KEY)');
    expect(resultHtml).toContain('window.history.replaceState');
  });
});
