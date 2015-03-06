FacebookSocialProvider = function(dispatchEvent) {
  console.log('FacebookSocialProvider called');
  this.dispatchEvent_ = dispatchEvent;
  this.networkName_ = 'facebook';
  this.initState_();
};
FacebookSocialProvider.prototype = new FirebaseSocialProvider();

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
    // TODO: can we force an account chooser so this tab doesn't instantly
    // redirect if they are already logged in?  Or can we try a GET request
    // to see if it gives us a token with no interaction needed?
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

FacebookSocialProvider.prototype.loadUsers_ = function() {
  // TODO: should we periodically check for new friends?  Or just force
  // users to logout then login again to detect new friends?
  this.facebookGet_('me/friends').then(function(resp) {
    // TODO: handle paging
    var users = resp.data;
    for (var i = 0; i < users.length; ++i) {
      this.addUserProfile_({
        id: users[i].id,
        name: users[i].name
      });
      this.getUserImage_(users[i].id);
    }
  }.bind(this)).catch(function(e) {
    console.error('loadUsers_ failed', e);
  });
};


FacebookSocialProvider.prototype.getUserImage_ = function(userId) {
  this.facebookGet_(userId + '/picture').then(function(resp) {
    this.updateUserProfile_(
        {id: userId, imageData: resp.data.url});
  }.bind(this)).catch(function(e) {
    console.error('failed to get image for userId ' + userId, e);
  });
};


FacebookSocialProvider.prototype.getMyUserProfile_ = function() {
  var imageData;
  var name;
  var url;
  var getImagePromise = this.facebookGet_('me/picture').then(function(resp) {
    imageData = resp.data.url;
  }).catch(function(e) { console.error('error getting me/picture', e); });
  var nameAndUrlPromise = this.facebookGet_('me').then(function(resp) {
    name = resp.name;
    url = resp.link;
  }).catch(function(e) { console.error('error getting me', e); });

  return Promise.all([getImagePromise, nameAndUrlPromise]).then(function() {
    return {
      userId: this.getUserId_(),
      name: name,
      lastUpdated: Date.now(),
      url: url,
      imageData: imageData
    };
  }.bind(this)).catch(function(e) {
    console.error('error in getMyUserProfile_', e);
  });
};


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
