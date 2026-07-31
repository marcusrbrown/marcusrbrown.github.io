const track = window.umami?.track

track?.()
track?.({url: '/about'})
track?.(properties => ({...properties, url: '/about'}))
track?.('navigation')
track?.('navigation', {destination: '/about'})
