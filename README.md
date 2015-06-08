# SoundCloud Discovery
Actually find music you want to listen to from SoundCloud.

![soundcloud_discovery](https://cloud.githubusercontent.com/assets/73099/8042788/93ea83d8-0def-11e5-9c23-d7e331dbcb13.png)

## What is this?
It's a simple Angular app that loads your SoundCloud feed from their API, then sorts and groups
it in ways that you might actually want to use.

#### Dependencies
- [AngularJS](https://angularjs.org)
- [Moment.js](momentjs.com) / [angular-moment](https://github.com/urish/angular-moment)
- SoundCloud [Javascript SDK](https://developers.soundcloud.com/docs/api/sdks#javascript) and [Widget](https://developers.soundcloud.com/docs/api/html5-widget)
- [Lodash](https://lodash.com/)

## How do I use it?
- Check it out at https://chanderson0.github.io/soundcloud_discovery
- Locally, just serve it. (e.g. `ruby -run -e httpd . -p 9292`)

## Contributing / Forking
PRs accepted. If you do run this on your own server, please change the API keys in `app.js`.
