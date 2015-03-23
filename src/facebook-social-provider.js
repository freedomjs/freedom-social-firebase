FacebookSocialProvider = function(dispatchEvent) {
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initLogger_('FacebookSocialProvider');
  this.initState_();
};
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

/*
 * Returns a Promise which fulfills with an OAuth token.
 */
FacebookSocialProvider.prototype.getOAuthToken_ = function() {
  var OAUTH_REDIRECT_URLS = [
    "https://fmdppkkepalnkeommjadgbhiohihdhii.chromiumapp.org/",
    "https://www.uproxy.org/oauth-redirect-uri",
    "http://freedomjs.org/",
    'http://localhost:8080/'
  ];
  var OAUTH_CLIENT_ID = '161927677344933';
  var OAUTH_SCOPE = 'user_friends';

  var oauth = freedom["core.oauth"]();
  return oauth.initiateOAuth(OAUTH_REDIRECT_URLS).then(function(stateObj) {
    var url = "https://www.facebook.com/dialog/oauth?" +
                "client_id=" + encodeURIComponent(OAUTH_CLIENT_ID) +
                "&scope=" + encodeURIComponent(OAUTH_SCOPE) +
                "&redirect_uri=" + encodeURIComponent(stateObj.redirect) +
                "&state=" + encodeURIComponent(stateObj.state) +
                "&response_type=token";
    return oauth.launchAuthFlow(url, stateObj);
  }).then(function(responseUrl) {
    return responseUrl.match(/access_token=([^&]+)/)[1];
  }).catch(function (err) {
    return Promise.reject('Login error: ' + err.message);
  });
};

/*
 * Loads contacts of the logged in user, and calls this.addUserProfile_
 * and this.updateUserProfile_ (if needed later, e.g. for async image
 * fetching) for each contact.
 */
FacebookSocialProvider.prototype.loadContacts_ = function() {
  this.facebookGet_('me/friends').then(function(resp) {
    var users = resp.data;
    for (var i = 0; i < users.length; ++i) {
      this.addUserProfile_({
        userId: users[i].id,
        name: users[i].name
      });
      this.getUserImage_(users[i].id);
    }
  }.bind(this)).catch(function(e) {
    this.logger.error('loadContacts_ failed', e);
  }.bind(this));
};

/*
 * Fetches the image for userId and invokes this.updateUserProfile_
 * with that image.
 */
FacebookSocialProvider.prototype.getUserImage_ = function(userId) {
  this.facebookGet_(userId + '/picture').then(function(resp) {
    this.updateUserProfile_(
        {userId: userId, imageData: resp.data.url});
  }.bind(this)).catch(function(e) {
    this.logger.error('failed to get image for userId ' + userId, e);
  }.bind(this));
};

/*
 * Returns UserProfile object for the logged in user.
 */
FacebookSocialProvider.prototype.getMyUserProfile_ = function() {
  if (!this.loginState_) {
    throw 'Error in FacebookSocialProvider.getMyUserProfile_: not logged in';
  }
  var cachedUserProfile =
      this.loginState_.authData[this.networkName_].cachedUserProfile;
  return {
    userId: this.getUserId_(),
    name: cachedUserProfile.name,
    lastUpdated: Date.now(),
    url: cachedUserProfile.link,
    imageData: cachedUserProfile.picture.data.url
  };
};

/*
 * Makes get request to Facebook endpoint, and returns a Promise which
 * fulfills with the response object.
 */
FacebookSocialProvider.prototype.facebookGet_ = function(endPoint) {
  if (!this.loginState_) {
    throw 'Not signed in';
  }
  var xhr = new XMLHttpRequest();
  var url = 'https://graph.facebook.com/v2.1/' + endPoint +
      '?access_token=' + this.loginState_.authData.facebook.accessToken +
      '&format=json&redirect=false';
  xhr.open('GET', url);
  return new Promise(function(fulfill, reject) {
    // TODO: error checking
    xhr.onload = function() {
      fulfill(JSON.parse(this.response));
    };
    xhr.send();
  });
};

// Register provider when in a module context.
if (typeof freedom !== 'undefined') {
  if (!freedom.social) {
    freedom().providePromises(FacebookSocialProvider);
  } else {
    freedom.social().providePromises(FacebookSocialProvider);
  }
}
