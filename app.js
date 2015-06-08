'use strict';

var HIGH_ACCOUNT_THRESH = 300;
var SC_PAGE_LIMIT = 25;

(function() {
  var app = angular.module('scDiscoApp', ['angularMoment']);

  app.filter('thousands', function() {
    return function(input) {
      if (input > 1000)
        return (input / 1000).toFixed(1) + 'k';
      else
        return input.toFixed(0);
    };
  });

  // Allow us to set src URLs directly for iframes.
  // See: http://stackoverflow.com/questions/24163152/angularjs-ng-src-inside-of-iframe
  app.filter('trustAsResourceUrl', ['$sce', function($sce) {
    return function(val) {
      return $sce.trustAsResourceUrl(val);
    };
  }]);

  app.factory('SCLoader', function($q) {
    var service = {};

    var nextPageUrl = '/me/activities';
    var userCache = {};
    var trackCache = {};

    var loadUser = function(id) {
      return $q(function(resolve, reject) {
        SC.get('/users/' + id, function(userData, err) {
          if (err) return reject(err);

          // Load last 100 tracks, find their average playcount.
          SC.get('/users/' + id + '/tracks', function(tracks, err) {
            // Ignore errors.

            var total = 0, count = 0;
            _.each(tracks, function(track) {
              if (track.playback_count) {
                total += track.playback_count;
                count++;
              }
            });

            // On error, assume this user is pretty popular.
            userData.average_plays_per_track = count > 0 ? total / count : 10000;

            return resolve(userData);
          });
        });
      });
    }
    
    var annotateTrack = function(trackData, userData) {
      var playbackCount = trackData.playback_count;

      // For display.
      trackData.user = userData;
      trackData.created = new Date(trackData.created_at);

      // Sort ratios.
      trackData.followerRatio = playbackCount / userData.followers_count;
      trackData.listenRatio = playbackCount / userData.average_plays_per_track;
      trackData.playsPerDay = playbackCount / ((new Date() - new Date(trackData.created_at)) / (1000 * 60 * 60 * 24));
    }

    service.init = function() {
      // Why only one redirect uri? :(
      return $q(function(resolve, reject) {
        if (window.location.hostname == "localhost") {
          SC.initialize({
            client_id: "87f94b11e296a6d22693946032fe0401",
            redirect_uri: "http://localhost:9292/callback.html",
          });
        } else {
          SC.initialize({
            client_id: "3c2bd4f751f45aca66269a1b1530ca3f",
            redirect_uri: "http://chanderson0.github.io/soundcloud_discovery/callback.html",
          });
        }

        SC.connect(resolve);
      });
    }

    service.nextPage = function() {
      return $q(function(resolve, reject) {
        console.log('Getting: ' + nextPageUrl);

        SC.get(nextPageUrl, { limit: SC_PAGE_LIMIT }, function(data, err) {
          if (err || !data || !data.collection) return reject(err);
          nextPageUrl = data.next_href;

          // Finish loading by loading user info.
          var promises = [];

          _.each(data.collection, function(activity) {
            var trackData = activity.origin;

            // We don't handle playlist posts yet.
            if (trackData.kind != 'track') return;

            // Check for dupes;
            if (trackCache[trackData.permalink_url]) return;
            trackCache[trackData.permalink_url] = true;

            var userId = trackData.user_id;

            // Someday, we'll just use ES6 `Promise.resolve`.
            var promise = $q(function(resolve) { resolve(userCache[userId]); })
            .then(function(userData) {
              if (!userData)
                return loadUser(userId);
              else
                return userData;
            }).then (function(userData) {
              userCache[userId] = userData;
              annotateTrack(trackData, userData);
              return trackData;
            });

            promises.push(promise);
          });

          return resolve($q.all(promises));
        });
      });
    }

    return service;
  });

  app.controller('DiscoController', function($scope, SCLoader) {
    var tracks = [],
        scWidget = null;

    this.sortModes = [
      { title: 'plays per day', value: 'playsPerDay', description: 'plays per day' },
      { title: 'raw playcount', value: 'playback_count', description: 'plays' },
      { title: 'plays per follower', value: 'followerRatio', description: 'plays per follower' },
      { title: 'plays vs. average', value: 'listenRatio', description: 'plays vs. average' }
    ];

    this.groupModes = [
      { title: 'day', value: 'day' },
      { title: 'week', value: 'week' },
      { title: 'month', value: 'month' },
      { title: 'artist name', value: 'user' },
    ];

    $scope.trackCount = 0;
    $scope.groups = [];
    $scope.state = {
      firstLoad: 'start',
      loading: false,
      sortBy: 'playsPerDay',
      metricDescription: 'plays per day',
      groupBy: 'week',
      largeAccountsShown: true
    }

    var groupTracks = function() {
      var groupMap = _.groupBy(tracks, function(track) {
        var date = moment(new Date(track.created_at));

        switch ($scope.state.groupBy) {
          case 'day': return date.format('YYYY-MM-DD');
          case 'week': return 'Week of ' + date.startOf('week').format('YYYY-MM-DD');
          case 'month': return date.format('YYYY-MM');
          case 'user': return track.user.username;
          default: return 'all';
        }
      });

      $scope.groups = _.collect(groupMap, function(tracks, groupName) {
        return { title: groupName, tracks: tracks };
      });
    }

    this.loadPage = function() {
      $scope.state.loading = true;

      return SCLoader.nextPage()
        .then(function(newTracks) {
          tracks = tracks.concat(newTracks);

          $scope.trackCount = tracks.length;
          $scope.state.loading = false;

          groupTracks();
        });
    }

    this.showLoadMore = function() {
      return !$scope.state.loading && $scope.state.firstLoad == 'loaded';
    }

    this.trackFilter = function(track) {
      if ($scope.state.largeAccountsShown) return true;
      return track.user.track_count < HIGH_ACCOUNT_THRESH;
    }

    this.trackMetric = function(track) {
      var val = track[$scope.state.sortBy];

      if (val > 1000)
        return (val / 1000).toFixed(1) + 'k';
      else if (val > 10)
        return val.toFixed(1);
      else
        return val.toFixed(2);
    }

    this.trackValue = function(track) {
      return -track[$scope.state.sortBy];
    }

    this.sortClicked = function(sortOption) {
      $scope.state.sortBy = sortOption.value;
      $scope.state.metricDescription = sortOption.description;
    }

    this.groupByClicked = function(groupMode) {
      $scope.state.groupBy = groupMode;
      groupTracks();
    }

    this.largeAccountsClicked = function(showLargeAccounts) {
      $scope.state.largeAccountsShown = showLargeAccounts;
    }

    this.groupHeaderClicked = function(group) {
      group.collapsed = !group.collapsed;
    }

    this.itemClicked = function(track) {
      if (!scWidget) {
        $scope.scUrl = location.protocol + "//w.soundcloud.com/player/?url=" + track.permalink_url;

        // We have to do this outside of the Angular event loop, otherwise things get wonky.
        setTimeout(function() { scWidget = SC.Widget('soundcloud'); }, 1);
      } else {
        scWidget.load(track.permalink_url, { auto_play: true });
      }
    }

    this.startClicked = function() {
      var self = this;

      // TODO: someone invent a way to effectively loop promises.
      SCLoader.init()
      .then(function() {
        console.log('Initialized Soundcloud.');
        $scope.state.firstLoad = 'loading';

        return self.loadPage();
      }).then(function() {
        $scope.state.firstLoad = 'loaded';

        return self.loadPage();
      }).then(function() {
        return self.loadPage();
      }).then(function() {
        return self.loadPage();
      }).then(function() {
        return self.loadPage();
      });
    }

  });

})();
