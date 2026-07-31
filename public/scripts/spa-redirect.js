// Single Page Apps for GitHub Pages
// https://github.com/rafgraph/spa-github-pages
//
// When GitHub Pages serves a 404 for a direct URL (e.g. /about), this script
// redirects to the root with the original path encoded in the query string so
// index.html can restore it via history.replaceState (see spa-restore.js).
;(function () {
  var l = window.location
  l.replace(
    l.protocol +
      '//' +
      l.hostname +
      (l.port ? ':' + l.port : '') +
      '/?p=/' +
      l.pathname.slice(1).replace(/&/g, '~and~') +
      (l.search ? '&q=' + l.search.slice(1).replace(/&/g, '~and~') : '') +
      l.hash,
  )
})()
