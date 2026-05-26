// net.js
// Shared fetch helper with 429 retry/backoff and optional per-attempt timeout.
// Used by api.js, enhancer.js, and vision.js. Must load before them.

window.CafeNet = (function () {

  // Resolves to the parsed JSON body, or rejects with an Error.
  // opts: { label, maxRetries (default 2), timeoutMs (0 = none) }
  function fetchJSON(url, fetchOptions, opts) {
    opts = opts || {};
    var label      = opts.label || '[CafeNet]';
    var maxRetries = opts.maxRetries != null ? opts.maxRetries : 2;
    var timeoutMs  = opts.timeoutMs || 0;

    function attemptOnce(attempt) {
      var timer = null;
      var options = fetchOptions;
      if (timeoutMs) {
        var controller = new AbortController();
        options = Object.assign({}, fetchOptions, { signal: controller.signal });
        timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      }

      return fetch(url, options).then(function (res) {
        if (timer) { clearTimeout(timer); timer = null; }
        return res.json().then(function (data) {
          if (!res.ok) {
            if (res.status === 429 && attempt < maxRetries) {
              var wait = (attempt + 1) * 5000;
              console.warn(label + ' 429 rate limit — retrying in ' + (wait / 1000) + 's (attempt ' + (attempt + 1) + ' of ' + maxRetries + ')');
              return new Promise(function (r) { setTimeout(r, wait); }).then(function () { return attemptOnce(attempt + 1); });
            }
            throw new Error(label + ' ' + res.status + ': ' + JSON.stringify(data));
          }
          return data;
        });
      }).catch(function (err) {
        if (timer) { clearTimeout(timer); timer = null; }
        throw err;
      });
    }

    return attemptOnce(0);
  }

  return { fetchJSON: fetchJSON };

})();
