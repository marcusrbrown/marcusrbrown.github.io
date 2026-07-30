// Single Page Apps for GitHub Pages — reverse redirect
// https://github.com/rafgraph/spa-github-pages
//
// 404.html (via spa-redirect.js) encodes the original path in the query string
// (?p=/path&q=search). This script restores the original URL via
// history.replaceState before React mounts so the router sees the correct
// path on direct navigation or page refresh.
;(function () {
  var search = window.location.search
  if (search.length > 1) {
    var params = new URLSearchParams(search.slice(1))
    var path = params.get('p')
    if (path != null) {
      var query = params.get('q')
      var url = path + (query ? '?' + query.replace(/~and~/g, '&') : '') + window.location.hash
      window.history.replaceState(null, '', url)
    }
  }
})()
